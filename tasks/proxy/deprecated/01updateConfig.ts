import { task } from 'hardhat/config'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { publicKey as metaplexPublicKey } from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import assert from 'assert'
import fs from 'fs'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { setupAnchor, getConfig, getOrderlyEid, getProxyConfigPda, getAllOftSendAccounts, updateConfig } from '../utils'

interface UpdateConfigTaskArgs {
    proxyProgramId?: string
    oftProgramId?: string
    oftEscrowAta?: string
}

/// Calling this task will find and update values in the Proxy config.
/// Suppose to be called on live network to get required params.
/// Also provides solana-test-validator configuration to mimic live network on local machine.
/// Config file name depends on the ENV variable in the .env file.
/// Can get required params from the config if exists
/// Supposed, that:
/// - oft program is already deployed and initialized
/// - proxy program is already deployed

task('proxy:updateConfig', 'Find and update Proxy config. Can get required params from the config if exists')
    .addOptionalParam(
        'proxyProgramId',
        'Proxy program ID. If not provided, it will be taken from the config if exists',
        undefined,
        devtoolsTypes.string
    )
    .addOptionalParam(
        'oftProgramId',
        'OFT program ID. If not provided, it will be taken from the config if exists',
        undefined,
        devtoolsTypes.string
    )
    .addOptionalParam(
        'oftEscrowAta',
        'OFT escrow ATA. If not provided, it will be taken from the config if exists',
        undefined,
        devtoolsTypes.string
    )
    .setAction(async ({ proxyProgramId, oftProgramId, oftEscrowAta }: UpdateConfigTaskArgs) => {
        const config = getConfig()

        if (proxyProgramId) {
            config.proxyProgramId = new PublicKey(proxyProgramId).toBase58()
            console.log(`proxyProgramId updated in config: ${config.proxyProgramId}`)
        } else if (!config.proxyProgramId) {
            throw new Error(
                'Please either define proxyProgramId in the config or pass it as a parameter --proxy-program-id'
            )
        }

        if (oftProgramId) {
            config.oftProgramId = new PublicKey(oftProgramId).toBase58()
            console.log(`oftProgramId updated in config: ${config.oftProgramId}`)
        } else if (!config.oftProgramId) {
            throw new Error(
                'Please either define oftProgramId in the config or pass it as a parameter --oft-program-id'
            )
        }

        if (oftEscrowAta) {
            config.oftEscrowAta = new PublicKey(oftEscrowAta).toBase58()
            console.log(`oftEscrowAta updated in config: ${config.oftEscrowAta}`)
        } else if (!config.oftEscrowAta) {
            throw new Error(
                'Please either define oftEscrowAta in the config or pass it as a parameter --oft-escrow-ata'
            )
        }

        const [provider] = setupAnchor('local')

        const proxyConfigPda = getProxyConfigPda(new PublicKey(config.proxyProgramId))
        config.proxyConfigPda = proxyConfigPda.toBase58()

        const oftSendAccounts = await getAllOftSendAccounts(
            provider,
            config.oftProgramId,
            config.oftEscrowAta,
            proxyConfigPda,
            getOrderlyEid()
        )
        // console.log('OFT send accounts for Proxy:', oftSendAccounts);

        // Let's parse and check set of received OFT send accounts
        assert(oftSendAccounts.length == 36, 'Unexpected number of OFT send accounts')
        const oftProgramIdMetaplexPublicKey = metaplexPublicKey(config.oftProgramId)
        assert(
            oftSendAccounts[0].pubkey == oftProgramIdMetaplexPublicKey,
            'First OFT send account should be OFT program ID'
        )
        const proxyConfigPdaMetaplexPublicKey = metaplexPublicKey(config.proxyConfigPda)
        assert(
            oftSendAccounts[1].pubkey == proxyConfigPdaMetaplexPublicKey,
            'Second OFT send account should be Proxy Config PDA'
        )
        config.peerPda = oftSendAccounts[2].pubkey.toString()
        config.oftStorePda = oftSendAccounts[3].pubkey.toString()
        config.proxyEscrowAta = oftSendAccounts[4].pubkey.toString()
        assert(
            oftSendAccounts[5].pubkey == metaplexPublicKey(config.oftEscrowAta),
            'Sixth OFT send account should be OFT escrow ATA'
        )
        config.mintPda = oftSendAccounts[6].pubkey.toString()
        // Check consistency of mint PDA and proxy escrow ATA
        assert(
            config.proxyEscrowAta == getAssociatedTokenAddressSync(new PublicKey(config.mintPda), proxyConfigPda, true),
            'Proxy escrow ATA should be associated with Proxy Config PDA'
        )
        assert(
            oftSendAccounts[7].pubkey == metaplexPublicKey(TOKEN_PROGRAM_ID),
            'Eighth OFT send account should be SPL Token program ID'
        )
        config.unknownPda = oftSendAccounts[8].pubkey.toString()
        assert(
            oftSendAccounts[9].pubkey == oftProgramIdMetaplexPublicKey,
            'Tenth OFT send account should be OFT program ID'
        )
        config.endpointV2ProgramId = oftSendAccounts[10].pubkey.toString()
        assert(
            oftSendAccounts[11].pubkey == metaplexPublicKey(config.oftStorePda),
            'Twelfth OFT send account should be OFT store PDA'
        )
        config.sendLibProgramId = oftSendAccounts[12].pubkey.toString()
        config.sendLibConfigPda = oftSendAccounts[13].pubkey.toString()
        config.defaultSendLibConfigPda = oftSendAccounts[14].pubkey.toString()
        config.sendLibInfoPda = oftSendAccounts[15].pubkey.toString()
        config.endpointSettingsPda = oftSendAccounts[16].pubkey.toString()
        config.noncePda = oftSendAccounts[17].pubkey.toString()
        config.eventAuthorityPda = oftSendAccounts[18].pubkey.toString()
        assert(
            oftSendAccounts[19].pubkey == metaplexPublicKey(config.endpointV2ProgramId),
            'Twentieth OFT send account should be Endpoint V2 program ID'
        )
        config.ulnSettingsPda = oftSendAccounts[20].pubkey.toString()
        config.sendConfigPda = oftSendAccounts[21].pubkey.toString()
        config.defaultSendConfigPda = oftSendAccounts[22].pubkey.toString()
        assert(
            oftSendAccounts[23].pubkey == proxyConfigPdaMetaplexPublicKey,
            'Twenty-fourth OFT send account should be Proxy Config PDA'
        )
        config.treasuryProgramId = oftSendAccounts[24].pubkey.toString()
        assert(
            oftSendAccounts[25].pubkey == fromWeb3JsPublicKey(SystemProgram.programId),
            'Twenty-sixth OFT send account should be System program ID'
        )
        config.ulnEventAuthorityPda = oftSendAccounts[26].pubkey.toString()
        assert(
            oftSendAccounts[27].pubkey == metaplexPublicKey(config.sendLibProgramId),
            'Twenty-eighth OFT send account should be Send Lib program ID'
        )
        config.executorProgramId = oftSendAccounts[28].pubkey.toString()
        config.executorConfigPda = oftSendAccounts[29].pubkey.toString()
        config.priceFeedProgramId = oftSendAccounts[30].pubkey.toString()
        config.priceFeedConfigPda = oftSendAccounts[31].pubkey.toString()
        config.dvnProgramId = oftSendAccounts[32].pubkey.toString()
        config.dvnConfigPda = oftSendAccounts[33].pubkey.toString()
        assert(
            oftSendAccounts[34].pubkey == metaplexPublicKey(config.priceFeedProgramId),
            'Thirty-fifth OFT send account should be Price Feed program ID'
        )
        assert(
            oftSendAccounts[35].pubkey == metaplexPublicKey(config.priceFeedConfigPda),
            'Thirty-sixth OFT send account should be Price Feed config PDA'
        )

        updateConfig(config)

        console.log('Execute the following command to set up local solana node:\n')
        console.log(
            `solana-test-validator --clone-upgradeable-program ${config.oftProgramId} --clone-upgradeable-program ${config.endpointV2ProgramId} --clone-upgradeable-program ${config.sendLibProgramId} --clone-upgradeable-program ${config.executorProgramId} --clone-upgradeable-program ${config.priceFeedProgramId} --clone-upgradeable-program ${config.dvnProgramId} --clone-upgradeable-program ${config.treasuryProgramId} -c ${config.oftEscrowAta} -c ${config.oftStorePda} -c ${config.peerPda} -c ${config.mintPda} -c ${config.sendLibConfigPda} -c ${config.defaultSendLibConfigPda} -c ${config.sendLibInfoPda} -c ${config.endpointSettingsPda} -c ${config.noncePda} -c ${config.ulnSettingsPda} -c ${config.sendConfigPda} -c ${config.defaultSendConfigPda} -c ${config.executorConfigPda} -c ${config.priceFeedConfigPda} -c ${config.dvnConfigPda} -c ${config.eventAuthorityPda} -c ${config.ulnEventAuthorityPda} --url devnet --reset`
        )
    })
