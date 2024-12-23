import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { createSignerFromKeypair, signerIdentity } from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import bs58 from 'bs58'

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