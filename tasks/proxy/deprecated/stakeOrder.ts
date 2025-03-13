import { findAssociatedTokenPda, mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { publicKey, transactionBuilder, createSignerFromKeypair, signerIdentity } from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'
import { task } from 'hardhat/config'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { addComputeUnitInstructions, getExplorerTxLink, getLayerZeroScanLink } from '../../solana/index'
import {
    encodeClaimRewardPayload,
    encodeOCCVaultMessage,
    getConfig,
    getOrderlyEid,
    getSolanaEid,
    LedgerToken,
    PayloadType,
    setupAnchor,
} from '../utils'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'

interface StakeOrderTaskArgs {
    amount: string
}

/// Calling this task will send Order token to the OCCManager contract on Orderly network from the Solana network and stake them to the OL.
task('proxy:stake-order', 'Stake Order token from the Solana network to the OmnichainLedger')
    .addParam('amount', 'amount to stake', '0', devtoolsTypes.string)
    .setAction(async ({ amount }: StakeOrderTaskArgs) => {
        const config = getConfig()
        const [provider, wallet, rpc] = setupAnchor()
        const umi = createUmi(rpc).use(mplToolbox())
        const umiWalletKeyPair = umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey)
        const umiWalletSigner = createSignerFromKeypair(umi, umiWalletKeyPair)
        umi.use(signerIdentity(umiWalletSigner))

        const oftProgramId = publicKey(config.oftProgramId)
        const mint = publicKey(config.mintPda)
        const umiEscrowPublicKey = publicKey(config.oftEscrowAta)
        const tokenProgramId = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)

        const tokenAccount = findAssociatedTokenPda(umi, {
            mint: publicKey(config.mintPda),
            owner: fromWeb3JsPublicKey(wallet.publicKey),
            tokenProgramId,
        })

        if (!tokenAccount) {
            throw new Error(
                `No token account found for mint ${config.mintPda} and owner ${wallet.publicKey} in program ${tokenProgramId}`
            )
        }

        const recipientAddressBytes32 = addressToBytes32(config.occManagerAddress)
        const toEid = getOrderlyEid()
        const fromEid = getSolanaEid()
        const computeUnitPriceScaleFactor = 4

        // TODO: Get chainedEventId from Proxy contract
        const chainedEventId = 123
        const emptyPayload = Buffer.from('')

        const composeMsg = encodeOCCVaultMessage(
            BigInt(chainedEventId),
            getSolanaEid(),
            LedgerToken.ORDER,
            amount,
            wallet.publicKey,
            PayloadType.Stake,
            emptyPayload
        )

        const { nativeFee } = await oft.quote(
            umi.rpc,
            {
                payer: fromWeb3JsPublicKey(wallet.publicKey),
                tokenMint: mint,
                tokenEscrow: umiEscrowPublicKey,
            },
            {
                payInLzToken: false,
                to: Buffer.from(recipientAddressBytes32),
                dstEid: toEid,
                amountLd: BigInt(amount),
                minAmountLd: BigInt(amount),
                options: Buffer.from(''),
                composeMsg,
            },
            {
                oft: oftProgramId,
            }
        )

        console.log('nativeFee:', nativeFee)

        const ix = await oft.send(
            umi.rpc,
            {
                payer: umiWalletSigner,
                tokenMint: mint,
                tokenEscrow: umiEscrowPublicKey,
                tokenSource: tokenAccount[0],
            },
            {
                to: Buffer.from(recipientAddressBytes32),
                dstEid: toEid,
                amountLd: BigInt(amount),
                minAmountLd: (BigInt(amount) * BigInt(9)) / BigInt(10),
                options: Buffer.from(''),
                composeMsg,
                nativeFee,
            },
            {
                oft: oftProgramId,
                token: tokenProgramId,
            }
        )

        let txBuilder = transactionBuilder().add([ix])
        txBuilder = await addComputeUnitInstructions(
            provider.connection,
            umi,
            fromEid,
            txBuilder,
            umiWalletSigner,
            computeUnitPriceScaleFactor
        )
        const { signature } = await txBuilder.sendAndConfirm(umi)
        const transactionSignatureBase58 = bs58.encode(signature)

        console.log(`✅ Sent ${amount} token(s) to destination EID: ${toEid}!`)
        const isTestnet = fromEid == EndpointId.SOLANA_V2_TESTNET
        console.log(
            `View Solana transaction here: ${getExplorerTxLink(transactionSignatureBase58.toString(), isTestnet)}`
        )
        console.log(`Track cross-chain transfer here: ${getLayerZeroScanLink(transactionSignatureBase58, isTestnet)}`)
    })
