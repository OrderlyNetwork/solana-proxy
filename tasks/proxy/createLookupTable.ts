import { task } from 'hardhat/config'
import {
    setupAnchor,
    getConfig,
    getOrderlyEid,
    getProxyConfigPda,
    getOftSendAccounts,
    createAndSendV0Tx,
    getConfigPath,
} from './utils'
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { AddressLookupTableProgram, PublicKey, SystemProgram } from '@solana/web3.js'
import fs from 'fs'

interface CreateLookupTableTaskArgs {
    force: boolean
}

task('proxy:createLookupTable', 'Print address, needed for Proxy as remain_accounts for OFT send command')
    .addFlag('force', 'Force reinitialization of the proxy authority')
    .setAction(async ({ force }: CreateLookupTableTaskArgs) => {
        const [provider, wallet] = setupAnchor()
        const config = getConfig()

        if (config.proxyLookupTable && !force) {
            console.log('Lookup table address:', config.proxyLookupTable)
            const lookupTableAccount = (
                await provider.connection.getAddressLookupTable(new PublicKey(config.proxyLookupTable))
            ).value
            if (lookupTableAccount) {
                console.log('Lookup table account:', lookupTableAccount)
                throw new Error('Lookup table account already exists. To overwrite it, use --force flag')
            }
        }

        const proxyConfigPda = getProxyConfigPda(new PublicKey(config.proxyProgramId))

        const oftSendAccounts = await getOftSendAccounts(
            provider,
            config.oftProgramId,
            config.oftEscrowAta,
            proxyConfigPda,
            getOrderlyEid()
        )
        const keys = oftSendAccounts.map((account) => toWeb3JsPublicKey(account.pubkey))
        keys.push(SystemProgram.programId)

        // Remove duplicate keys
        const uniqueKeys = Array.from(new Set(keys.map((key) => key.toBase58()))).map((key) => new PublicKey(key))
        console.log(
            'keys:',
            uniqueKeys.map((key) => key.toBase58())
        )

        let slot = (await provider.connection.getSlot()) - 1

        const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
            authority: wallet.publicKey,
            payer: wallet.publicKey,
            recentSlot: slot,
        })

        console.log('lookup table address:', lookupTableAddress.toBase58())

        await createAndSendV0Tx([lookupTableInst], provider, wallet)

        const extendInstruction = AddressLookupTableProgram.extendLookupTable({
            payer: wallet.publicKey,
            authority: wallet.publicKey,
            lookupTable: lookupTableAddress,
            addresses: uniqueKeys,
        })

        await createAndSendV0Tx([extendInstruction], provider, wallet)

        config.proxyLookupTable = lookupTableAddress.toBase58()
        const configPath = getConfigPath()
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        console.log(`Config saved to ${configPath}\n`)
    })
