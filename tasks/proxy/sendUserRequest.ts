import { task } from 'hardhat/config'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js'
import { addressToBytes32, Options } from '@layerzerolabs/lz-v2-utilities'
import { EndpointProgram, simulateTransaction } from '@layerzerolabs/lz-solana-sdk-v2'
import {
    createAndSendV0TxWithTable,
    createComposeMsgForUserRequest,
    getAccountsForEndpointV2QuoteSend,
    getAccountsForEndpointV2Send,
    getConfig,
    getDeployedOftProgram,
    getOrderlyEid,
    getPayloadDataType,
    getRequestOpts,
    printTxLinks,
    setupAnchor,
    PayloadDataType,
} from './utils'

interface SendUserRequestTaskArgs {
    amount: string
    payloadType: string
}

/// Send user request with particular payload type, that defines the action to be taken on OmnichainLedger contract on Orderly network from the Solana network.
task('proxy:send-user-request', 'Send user request to the OmnichainLedger contract on Orderly network')
    .addParam('amount', 'amount or request id depending on request type ', '0', devtoolsTypes.string)
    .addParam('payloadType', 'payload type', undefined, devtoolsTypes.string)
    .setAction(async ({ amount, payloadType }: SendUserRequestTaskArgs) => {
        const payloadDataType = getPayloadDataType(payloadType)
        console.log('Payload data type:', payloadDataType)

        const [provider, wallet] = setupAnchor()

        const requestOpts = await getRequestOpts(provider, payloadDataType, wallet)

        const composeMsg = createComposeMsgForUserRequest(payloadDataType, amount, requestOpts.nonce, wallet.publicKey)

        const nativeFee = await getNativeFee(provider, amount, composeMsg, wallet)
        const txSig = await sendTransaction(provider, amount, composeMsg, wallet, nativeFee)

        if (payloadDataType === PayloadDataType.Stake) {
            console.log(`✅ Sent ${amount} token(s) to Orderly chain!`)
        }

        printTxLinks(txSig)
    })

async function getNativeFee(provider: AnchorProvider, amount: string, composeMsg: Uint8Array, wallet: Wallet) {
    const config = getConfig()
    const oftProgram = getDeployedOftProgram(provider)
    const recipientAddressBytes32 = addressToBytes32(config.occManagerAddress)
    const toEid = getOrderlyEid()
    const options = Options.newOptions().addExecutorComposeOption(0, 300000, 0).toBytes()

    const oftQuoteSendParams = {
        dstEid: toEid,
        to: Array.from(recipientAddressBytes32),
        amountLd: new BN(amount),
        minAmountLd: new BN(((BigInt(amount) * BigInt(9)) / BigInt(10)).toString()),
        options: Buffer.from(options),
        composeMsg: Buffer.from(composeMsg),
        payInLzToken: false,
    }

    const oftQuoteSendAccounts = {
        oftStore: new PublicKey(config.oftStorePda),
        peer: new PublicKey(config.peerPda),
        tokenMint: new PublicKey(config.mintPda),
    }

    const oftQuoteSendRemainingAccounts = getAccountsForEndpointV2QuoteSend()

    const ixQuoteSend = await oftProgram.methods
        .quoteSend(oftQuoteSendParams)
        .accounts(oftQuoteSendAccounts)
        .remainingAccounts(oftQuoteSendRemainingAccounts)
        .instruction()

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000,
    })

    const buffer = await simulateTransaction(
        provider.connection,
        [modifyComputeUnits, ixQuoteSend],
        ixQuoteSend.programId,
        wallet.publicKey,
        'confirmed',
        undefined,
        new PublicKey(config.proxyLookupTable)
    )

    const fee = EndpointProgram.types.messagingFeeBeet.read(buffer, 0)
    return new BN(fee.nativeFee)
}

async function sendTransaction(
    provider: AnchorProvider,
    amount: string,
    composeMsg: Uint8Array,
    wallet: Wallet,
    nativeFee: BN
) {
    const config = getConfig()
    const oftProgram = getDeployedOftProgram(provider)
    const signerAta = getAssociatedTokenAddressSync(new PublicKey(config.mintPda), wallet.publicKey)
    const recipientAddressBytes32 = addressToBytes32(config.occManagerAddress)
    const toEid = getOrderlyEid()
    const options = Options.newOptions().addExecutorComposeOption(0, 300000, 0).toBytes()
    const ixAddComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

    const oftSendParams = {
        dstEid: toEid,
        to: Array.from(recipientAddressBytes32),
        amountLd: new BN(amount),
        minAmountLd: new BN(((BigInt(amount) * BigInt(9)) / BigInt(10)).toString()),
        options: Buffer.from(options),
        composeMsg: Buffer.from(composeMsg),
        nativeFee,
        lzTokenFee: new BN(0),
    }

    const oftSendAccounts = {
        signer: wallet.publicKey,
        peer: new PublicKey(config.peerPda),
        oftStore: new PublicKey(config.oftStorePda),
        tokenSource: signerAta,
        tokenEscrow: new PublicKey(config.oftEscrowAta),
        tokenMint: new PublicKey(config.mintPda),
        tokenProgram: TOKEN_PROGRAM_ID,
        eventAuthority: new PublicKey(config.unknownPda),
        program: new PublicKey(config.oftProgramId),
    }

    const ixSend = await oftProgram.methods
        .send(oftSendParams)
        .accounts(oftSendAccounts)
        .remainingAccounts(getAccountsForEndpointV2Send(wallet.publicKey, true))
        .instruction()

    return await createAndSendV0TxWithTable([ixSend, ixAddComputeBudget], provider, wallet.publicKey, [wallet.payer])
}
