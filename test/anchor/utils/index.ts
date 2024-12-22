import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { EddsaInterface, createSignerFromKeypair, publicKey, signerIdentity } from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createWeb3JsEddsa } from '@metaplex-foundation/umi-eddsa-web3js'
import bs58 from 'bs58'

import { EndpointId, endpointIdToNetwork } from '@layerzerolabs/lz-definitions'
import { OftPDA } from '@layerzerolabs/oft-v2-solana-sdk'

// import { createSolanaConnectionFactory } from '../common/utils'
import { AnchorProvider, Provider, Wallet } from '@coral-xyz/anchor'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'

const getFromEnv = (key: string): string => {
    const value = process.env[key]
    if (!value) {
        throw new Error(`${key} is not defined in the environment variables.`)
    }
    return value
}


/**
 * Derive common connection and UMI objects for a given endpoint ID.
 * @param eid {EndpointId}
 */
export const deriveConnection = async (provider: AnchorProvider) => {
    const wallet = provider.wallet as Wallet
    // const privateKey = getSolanaPrivateKeyFromEnv()
    // const connectionFactory = createSolanaConnectionFactory()
    // const connection = await connectionFactory(eid)
    const umi = createUmi(provider.connection.rpcEndpoint).use(mplToolbox())
    // const umiWalletKeyPair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(provider.wallet))
    const umiWalletKeyPair = fromWeb3JsKeypair(wallet.payer)
    const umiWalletSigner = createSignerFromKeypair(umi, umiWalletKeyPair)
    umi.use(signerIdentity(umiWalletSigner))
    return {
        umi,
        umiWalletKeyPair,
        umiWalletSigner,
    }
}