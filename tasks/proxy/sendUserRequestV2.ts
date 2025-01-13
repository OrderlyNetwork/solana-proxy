import { task } from 'hardhat/config'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { addressToBytes32, Options } from '@layerzerolabs/lz-v2-utilities'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { findAssociatedTokenPda, mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import {
    publicKey,
    createSignerFromKeypair,
    signerIdentity,
    TransactionBuilder,
    AddressLookupTableInput,
    PublicKey,
} from '@metaplex-foundation/umi'
import { fromWeb3JsInstruction, fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'
import {
    getConfig,
    getLookupTableAccount,
    getOrderlyEid,
    printTxLinks,
    setupAnchor,
    getPayloadDataType,
    createComposeMsgForUserRequest,
    PayloadDataType,
} from './utils'
import { AnchorProvider, Wallet, web3 } from '@coral-xyz/anchor'

interface SendUserRequestTaskArgs {
    amount: string
    payloadType: string
}

/// Send user request with particular payload type, that defines the action to be taken on OmnichainLedger contract on Orderly network from the Solana network.
task('proxy:send-user-request-v2', 'Send user request to the OmnichainLedger contract on Orderly network')
    .addParam('amount', 'amount or request id depending on request type ', '0', devtoolsTypes.string)
    .addParam('payloadType', 'payload type', undefined, devtoolsTypes.string)
    .setAction(async ({ amount, payloadType }: SendUserRequestTaskArgs) => {
        const payloadDataType = getPayloadDataType(payloadType)
        console.log('Payload data type:', payloadDataType)

        const config = getConfig()
        const [provider, wallet, rpc] = setupAnchor()

        // TODO: Get chainedEventId from Proxy contract
        const chainedEventId = 123

        const composeMsg = createComposeMsgForUserRequest(payloadDataType, amount, chainedEventId, wallet.publicKey)

        const { umi, umiWalletSigner } = setupUmi(rpc, wallet)
        const { oftProgramId, mint, umiEscrowPublicKey, tokenProgramId, userTokenAccount } = getOftProgramDetails(
            config,
            umi,
            wallet
        )

        const recipientAddressBytes32 = addressToBytes32(config.occManagerAddress)
        const dstEid = getOrderlyEid()
        const options = Options.newOptions().addExecutorComposeOption(0, 300000, 0).toBytes()
        const minAmountLd = (BigInt(amount) * BigInt(9)) / BigInt(10)

        const nativeFee = await getNativeFee(
            umi,
            wallet,
            mint,
            umiEscrowPublicKey,
            dstEid,
            recipientAddressBytes32,
            amount,
            minAmountLd,
            options,
            composeMsg,
            oftProgramId,
            config
        )

        const lookupTable = await getLookupTable(provider, config)

        const txSig = await sendTransaction(
            umi,
            umiWalletSigner,
            mint,
            umiEscrowPublicKey,
            userTokenAccount,
            dstEid,
            recipientAddressBytes32,
            amount,
            minAmountLd,
            options,
            composeMsg,
            nativeFee,
            oftProgramId,
            tokenProgramId,
            lookupTable
        )

        if (payloadDataType === PayloadDataType.Stake) {
            console.log(`✅ Sent ${amount} token(s) to Orderly chain!`)
        }

        printTxLinks(bs58.encode(txSig.signature))
    })

function setupUmi(rpc: string, wallet: Wallet) {
    const umi = createUmi(rpc).use(mplToolbox())
    const umiWalletKeyPair = umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey)
    const umiWalletSigner = createSignerFromKeypair(umi, umiWalletKeyPair)
    umi.use(signerIdentity(umiWalletSigner))
    return { umi, umiWalletSigner }
}

function getOftProgramDetails(config: any, umi: any, wallet: Wallet) {
    const oftProgramId = publicKey(config.oftProgramId)
    const mint = publicKey(config.mintPda)
    const umiEscrowPublicKey = publicKey(config.oftEscrowAta)
    const tokenProgramId = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)

    const userTokenAccount = findAssociatedTokenPda(umi, {
        mint: publicKey(config.mintPda),
        owner: fromWeb3JsPublicKey(wallet.publicKey),
        tokenProgramId,
    })

    if (!userTokenAccount) {
        throw new Error(
            `No token account found for mint ${config.mintPda} and owner ${wallet.publicKey} in program ${tokenProgramId}`
        )
    }

    return { oftProgramId, mint, umiEscrowPublicKey, tokenProgramId, userTokenAccount }
}

async function getNativeFee(
    umi: any,
    wallet: Wallet,
    mint: PublicKey,
    umiEscrowPublicKey: PublicKey,
    dstEid: number,
    recipientAddressBytes32: Uint8Array,
    amount: string,
    minAmountLd: bigint,
    options: Uint8Array,
    composeMsg: Uint8Array,
    oftProgramId: PublicKey,
    config: any
) {
    const { nativeFee } = await oft.quote(
        umi.rpc,
        {
            payer: fromWeb3JsPublicKey(wallet.publicKey),
            tokenMint: mint,
            tokenEscrow: umiEscrowPublicKey,
        },
        {
            dstEid,
            to: Buffer.from(recipientAddressBytes32),
            amountLd: BigInt(amount),
            minAmountLd,
            options: Buffer.from(options),
            composeMsg,
            payInLzToken: false,
        },
        {
            oft: oftProgramId,
        },
        undefined,
        publicKey(config.proxyLookupTable)
    )
    return nativeFee
}

async function getLookupTable(provider: AnchorProvider, config: any) {
    const lookupTableAccount = await getLookupTableAccount(provider, config.proxyLookupTable)
    const addresses = lookupTableAccount.state.addresses.map((address) => publicKey(address))

    return {
        publicKey: publicKey(config.proxyLookupTable),
        addresses: addresses,
    }
}

async function sendTransaction(
    umi: any,
    umiWalletSigner: any,
    mint: PublicKey,
    umiEscrowPublicKey: PublicKey,
    userTokenAccount: any,
    dstEid: number,
    recipientAddressBytes32: Uint8Array,
    amount: string,
    minAmountLd: bigint,
    options: Uint8Array,
    composeMsg: Uint8Array,
    nativeFee: any,
    oftProgramId: PublicKey,
    tokenProgramId: PublicKey,
    lookupTable: AddressLookupTableInput
) {
    return await new TransactionBuilder(
        [
            {
                instruction: fromWeb3JsInstruction(
                    web3.ComputeBudgetProgram.setComputeUnitLimit({
                        units: 400000,
                    })
                ),
                signers: [],
                bytesCreatedOnChain: 0,
            },
            await oft.send(
                umi.rpc,
                {
                    payer: umiWalletSigner,
                    tokenMint: mint,
                    tokenEscrow: umiEscrowPublicKey,
                    tokenSource: userTokenAccount[0],
                },
                {
                    dstEid,
                    to: Buffer.from(recipientAddressBytes32),
                    amountLd: BigInt(amount),
                    minAmountLd,
                    options: Buffer.from(options),
                    composeMsg,
                    nativeFee,
                },
                {
                    oft: oftProgramId,
                    token: tokenProgramId,
                }
            ),
        ],
        { feePayer: umiWalletSigner, addressLookupTables: [lookupTable] }
    ).sendAndConfirm(umi, { send: { preflightCommitment: 'confirmed', commitment: 'confirmed' } })
}
