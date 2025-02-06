import { PathOrFileDescriptor, readFileSync } from 'fs'

import fs from 'fs'
import path, { join } from 'path'
import { toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters'
import { WrappedInstruction } from '@metaplex-foundation/umi'
import {
    AccountMeta,
    Connection,
    PublicKey,
    Signer,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    VersionedTransactionResponse,
    AddressLookupTableProgram,
    ComputeBudgetProgram,
} from '@solana/web3.js'
import { AnchorProvider, BN, Program, setProvider, Wallet } from '@coral-xyz/anchor'
import { getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { OftPDA, accounts, oft, instructions } from '@layerzerolabs/oft-v2-solana-sdk'
import {
    AccountMeta as MetaplexAccountMeta,
    createNoopSigner,
    createSignerFromKeypair,
    publicKey as metaplexPublicKey,
    signerIdentity,
    transactionBuilder,
} from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { findAssociatedTokenPda, mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { addressToBytes32, bytes32ToEthAddress, Options } from '@layerzerolabs/lz-v2-utilities'
import {
    EndpointPDADeriver,
    EndpointProgram,
    EventPDADeriver,
    MessageLibInterface,
    SetConfigType,
    SimpleMessageLibProgram,
    UlnPDADeriver,
    UlnProgram,
    simulateTransaction,
    SendHelper,
} from '@layerzerolabs/lz-solana-sdk-v2'
import { arrayify, hexlify } from '@layerzerolabs/lz-utilities'
import { ethers } from 'ethers'
import { defaultAbiCoder } from '@ethersproject/abi'
import { isAddress } from 'web3-validator'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { EndpointId } from '@layerzerolabs/lz-definitions'

import { IDL as proxyIDL, SolanaProxy } from '../../target/types/solana_proxy'
import { IDL as oftIDL, Oft } from '../../types/oft'
import { addComputeUnitInstructions, getExplorerTxLink, getLayerZeroScanLink } from '../solana'
import { assert } from '@layerzerolabs/lz-utilities'
import * as borsh from 'borsh'

import * as constants from './constants'
import { PayloadType } from './constants'
import { getClaimDataPda, getPeerPda, getProxyConfigPda } from './pdaHelper'

// const LOCALHOST_RPC_URL = 'http://localhost:8899'
// const SOLANA_DEVNET_RPC_URL = 'https://api.devnet.solana.com'
// const SOLANA_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com'
// const SOLANA_AMOUNT_SCALE_FACTOR = ethers.BigNumber.from('100000000')

export function setUpEnv(ENV: string) {
    const [provider, wallet, rpc] = setupAnchor(ENV)
    const proxyProgram = getProxyProgram(ENV, provider)
    const oftProgram = getOftProgram(ENV, provider)
    // const endpoint = getEndpoint()
    // const usdcTokenAccount = getUsdcTokenAccount(ENV)
    const orderlyEid = getOrderlyEid(ENV)
    const solChainId = getSolanaChainId(ENV)
    return [provider, wallet, rpc, proxyProgram, orderlyEid, solChainId]
}

export function setupAnchor(ENV: string): [AnchorProvider, Wallet, string] {
    checkENV(ENV)
    let ANCHOR_PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL
    if (!ANCHOR_PROVIDER_URL) {
        process.env.ANCHOR_PROVIDER_URL = constants.SOLANA_INFO[ENV].rpc
    }
    const provider = AnchorProvider.env()
    setProvider(provider)
    const rpc = provider.connection.rpcEndpoint
    console.log(`Running on ${ENV} environment. Rpc: ${rpc}`)
    const wallet = provider.wallet as Wallet
    return [provider, wallet, rpc]
}

export function getUmi(ENV: string) {
    return createUmi(constants.SOLANA_INFO[ENV].rpc)
}

export function getOftAccounts(ENV: string) {
    return constants.OFT_ACCOUNTS[ENV]
}

export function getSolanaEid(ENV: string): number {
    if (ENV === constants.ENV[4]) {
        return EndpointId.SOLANA_V2_MAINNET
    }
    return EndpointId.SOLANA_V2_TESTNET
}

export function isDevnet(ENV: string): boolean {
    return ENV !== constants.ENV[4]
}

export function getProxyProgram(ENV: string, provider: AnchorProvider): Program<SolanaProxy> {
    console.log('Proxy program ID:', constants.PROXY_ACCOUNTS[ENV].programId.toString())
    return new Program<SolanaProxy>(proxyIDL, constants.PROXY_ACCOUNTS[ENV].programId.toString(), provider)
}

export function getOftProgram(ENV: string, provider: AnchorProvider): Program<Oft> {
    return new Program<Oft>(oftIDL, constants.OFT_ACCOUNTS[ENV].programId.toString(), provider)
}
export function amountStrToBytes32(
    amountStr: string,
    scaleFactor: ethers.BigNumber = ethers.BigNumber.from('1')
): number[] {
    const bigNumber = ethers.BigNumber.from(amountStr).mul(scaleFactor)
    const bytes32 = ethers.utils.zeroPad(bigNumber.toHexString(), 32)
    return Array.from(bytes32)
}

export function getAmountFromStr(amountStr: string) {
    const bigNumber = ethers.BigNumber.from(amountStr)
    return bigNumber.toBigInt()
}

export function convertBytes32ToHex(bytes32: number[]) {
    return '0x' + bytes32.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function encodeClaimRewardPayload(distributionId: string, cumulativeAmount: string, root: string) {
    const encodedStr = defaultAbiCoder.encode(
        ['tuple(uint32,uint256,bytes32)'],
        [[distributionId, cumulativeAmount, root]]
    )
    const encodedBytesArray = arrayify(encodedStr)
    console.log('Encoded claim reward payload:', encodedBytesArray, encodedBytesArray.length)
    return encodedBytesArray
}

// export function getProxyConfigPda(proxyProgramId: PublicKey): PublicKey {
//     return PublicKey.findProgramAddressSync([Buffer.from(PROXY_CONFIG_SEED, 'utf8')], proxyProgramId)[0]
// }

export function printTxLinks(ENV: string, txid: string) {
    console.log(`Solana transaction:    ${getExplorerTxLink(txid, isDevnet(ENV))}`)
    console.log(`LzyerZero transaction: ${getLayerZeroScanLink(txid, isDevnet(ENV))}`)
}

export function printProxyConfig(proxyConfig: any) {
    console.log(`Print Proxy Config:`)
    // console.log('  bump:             ', proxyConfig.bump.toString())
    console.log('  endpointProgram:  ', proxyConfig.endpointProgram.toBase58())
    console.log('  usdcTokenAccount: ', proxyConfig.usdcTokenAccount.toBase58())

    console.log('  admin:            ', proxyConfig.admin.toBase58())
    console.log('  orderlyEid:       ', proxyConfig.orderlyEid.toString())
    console.log('  solChainId:       ', proxyConfig.solChainId.toString())
    console.log('  paused:           ', proxyConfig.paused.toString())
}

export function printPeerPda(peer: any) {
    console.log(`Print Peer Pda:`)
    console.log('  peer address: ', bytes32ToEthAddress(Buffer.from(peer.peerAddress as Uint8Array)))
}

export async function createAndSendV0Tx(
    txInstructions: TransactionInstruction[],
    provider: AnchorProvider,
    wallet: Wallet
) {
    // Step 1 - Fetch Latest Blockhash
    let latestBlockhash = await provider.connection.getLatestBlockhash('finalized')

    // Step 2 - Generate Transaction Message
    const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions,
    }).compileToV0Message()
    const transaction = new VersionedTransaction(messageV0)

    // Step 3 - Sign your transaction with the required `Signers`
    transaction.sign([wallet.payer])

    // Step 4 - Send our v0 transaction to the cluster
    const txid = await provider.connection.sendTransaction(transaction, { maxRetries: 5 })
    // console.log('   ✅ - Transaction sent to network', txid)

    // await new Promise((r) => setTimeout(r, 2000))
    return txid
}

export async function getLookupTableAccount(provider: AnchorProvider, alt: PublicKey) {
    const lookupTableAccount = (await provider.connection.getAddressLookupTable(alt)).value
    if (!lookupTableAccount) {
        throw new Error(`Lookup table account ${alt.toString()} does not exist. Please create it first.`)
    }
    return lookupTableAccount
}

export async function createAndSendV0TxWithTable(
    txInstructions: TransactionInstruction[],
    provider: AnchorProvider,
    payerPubKey: PublicKey,
    signers: Signer[],
    alt: PublicKey
) {
    const lookupTableAccount = await getLookupTableAccount(provider, alt)
    const msg = new TransactionMessage({
        payerKey: payerPubKey,
        recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
        instructions: txInstructions,
    }).compileToV0Message([lookupTableAccount])
    const tx = new VersionedTransaction(msg)
    tx.sign(signers)
    return await provider.connection.sendTransaction(tx)
}

export async function createALT(provider: AnchorProvider, wallet: Wallet) {
    const ixCreateALT = await AddressLookupTableProgram.createLookupTable({
        authority: wallet.publicKey,
        payer: wallet.publicKey,
        recentSlot: await provider.connection.getSlot(),
    })
    const tx = await createAndSendV0Tx([ixCreateALT[0]], provider, wallet)
    console.log('ALT created:', tx)
    console.log('ALT pda:', ixCreateALT[1])
    return ixCreateALT[1]
}

export async function extendALT(provider: AnchorProvider, wallet: Wallet, alt: PublicKey, addressList: PublicKey[]) {
    console.log('Extending ALT...')
    console.log('alt:', alt)
    const ixExtendLookupTable = AddressLookupTableProgram.extendLookupTable({
        payer: wallet.publicKey,
        authority: wallet.publicKey,
        lookupTable: alt,
        addresses: addressList,
    })
    console.log(ixExtendLookupTable.keys)
    console.log('ixExtendLookupTable:', ixExtendLookupTable)
    const tx = await createAndSendV0Tx([ixExtendLookupTable], provider, wallet)
    console.log('ALT extended:', tx)
}

export function bytes32ToEvmAddress(bytes32Address: Uint8Array): string {
    if (bytes32Address.length !== 32) {
        throw new Error('Invalid peerAddress length. Expected 32 bytes.')
    }

    // Slice the last 20 bytes
    const evmAddressBytes = bytes32Address.slice(-20)

    // Convert to hexadecimal string and prepend '0x'
    const evmAddress =
        '0x' +
        Array.from(evmAddressBytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')

    return evmAddress
}
export function metaplexToWeb3AccountMetaArray(metaplexAccountMetaArray: MetaplexAccountMeta[]): AccountMeta[] {
    return metaplexAccountMetaArray.map((acc) => {
        return {
            pubkey: toWeb3JsPublicKey(acc.pubkey),
            isSigner: acc.isSigner,
            isWritable: acc.isWritable,
        }
    })
}

async function getCommonOftAccounts(
    provider: AnchorProvider,
    oftProgramIdStr: string,
    oftEscrowAtaStr: string,
    dstEid: number
) {
    const umi = createUmi(provider.connection)

    const oftProgramId = metaplexPublicKey(oftProgramIdStr)
    const deriver = new OftPDA(oftProgramId)

    const tokenEscrow = metaplexPublicKey(oftEscrowAtaStr)
    const tokenEscrowInfo = await getAccount(provider.connection, new PublicKey(tokenEscrow))
    const tokenMint = fromWeb3JsPublicKey(tokenEscrowInfo.mint)

    const [oftStore] = deriver.oftStore(tokenEscrow)
    const [peer] = deriver.peer(oftStore, dstEid)
    const peerInfo = await accounts.fetchPeerConfig(umi, peer)

    const sendHelper = new SendHelper()

    return { oftProgramId, tokenEscrow, tokenMint, oftStore, peer, peerInfo, sendHelper }
}

function fakeSendInstructionData(dstEid: number) {
    return {
        dstEid: dstEid,
        to: addressToBytes32('0xDead'),
        amountLd: 1n,
        minAmountLd: 1n,
        options: new Uint8Array(),
        composeMsg: null,
    }
}

export async function getAllOftQuoteSendAccounts(
    provider: AnchorProvider,
    oftProgramIdStr: string,
    oftEscrowAtaStr: string,
    signerPubKey: PublicKey,
    dstEid: number
): Promise<MetaplexAccountMeta[]> {
    const { oftProgramId, tokenMint, oftStore, peer, peerInfo, sendHelper } = await getCommonOftAccounts(
        provider,
        oftProgramIdStr,
        oftEscrowAtaStr,
        dstEid
    )

    const txBuilder = instructions.quoteSend(
        { programs: oft.createOFTProgramRepo(oftProgramId) },
        {
            oftStore: oftStore,
            peer: peer,
            tokenMint: tokenMint,

            // The following parameters can be any value and will not affect obtaining the accounts.
            ...fakeSendInstructionData(dstEid),
            payInLzToken: false,
        }
    )

    // Get remaining accounts from msgLib(simple_msgLib or uln)
    const ix = txBuilder.addRemainingAccounts(
        (
            await sendHelper.getQuoteAccounts(
                provider.connection,
                signerPubKey,
                toWeb3JsPublicKey(oftStore),
                dstEid,
                hexlify(peerInfo.peerAddress)
            )
        ).map((acc) => {
            return {
                pubkey: fromWeb3JsPublicKey(acc.pubkey),
                isSigner: acc.isSigner,
                isWritable: acc.isWritable,
            }
        })
    ).items[0]

    return [
        {
            pubkey: ix.instruction.programId,
            isSigner: false,
            isWritable: false,
        },
        ...ix.instruction.keys,
    ]
}

export async function printQuoteSendRemainAccounts(ENV: string, provider: AnchorProvider) {
    const wallet = provider.wallet as Wallet
    const config = getConfig()
    const dstEid = getOrderlyEid(ENV)
    const { oftProgramId, tokenMint, oftStore, peer, peerInfo, sendHelper } = await getCommonOftAccounts(
        provider,
        config.oftProgramId,
        config.oftEscrowAta,
        dstEid
    )

    const quoteSendRemainAccounts = (
        await sendHelper.getQuoteAccounts(
            provider.connection,
            wallet.publicKey,
            toWeb3JsPublicKey(oftStore),
            dstEid,
            hexlify(peerInfo.peerAddress)
        )
    ).map((acc) => {
        return {
            pubkey: fromWeb3JsPublicKey(acc.pubkey),
            isSigner: acc.isSigner,
            isWritable: acc.isWritable,
        }
    })

    console.log('Quote send remaining accounts:', quoteSendRemainAccounts)
}

export function getAccountsForEndpointV2QuoteSend(): AccountMeta[] {
    const config = getConfig()
    return [
        // ----------- Endpoint V2 quote send addresses -----------
        accountMeta(config.endpointV2ProgramId, false, false),
        accountMeta(config.sendLibProgramId, false, false),
        accountMeta(config.sendLibConfigPda, false, false),
        accountMeta(config.defaultSendLibConfigPda, false, false),
        accountMeta(config.sendLibInfoPda, false, false),
        accountMeta(config.endpointSettingsPda, false, false),
        accountMeta(config.noncePda, false, false),
        // ----------- Unknown part -----------
        accountMeta(config.ulnSettingsPda, false, false),
        accountMeta(config.sendConfigPda, false, false),
        accountMeta(config.defaultSendConfigPda, false, false),
        // ----------- Send (Message) Library send addresses -----------
        accountMeta(config.executorProgramId, false, false),
        accountMeta(config.executorConfigPda, false, false),
        accountMeta(config.priceFeedProgramId, false, false),
        accountMeta(config.priceFeedConfigPda, false, false),
        accountMeta(config.dvnProgramId, false, false),
        accountMeta(config.dvnConfigPda, false, false),
        accountMeta(config.priceFeedProgramId, false, false),
        accountMeta(config.priceFeedConfigPda, false, false),
    ]
}

export function getAccountsForOftSend(signer: string | PublicKey, signerSigns: boolean): AccountMeta[] {
    const config = getConfig()
    return [
        // ----------- Oft send addresses -----------
        accountMeta(config.oftProgramId, false, false),
        accountMeta(signer, signerSigns, false),
        accountMeta(config.peerPda, false, true),
        accountMeta(config.oftStorePda, false, true),
        accountMeta(config.proxyEscrowAta, false, true),
        accountMeta(config.oftEscrowAta, false, true),
        accountMeta(config.mintPda, false, true),
        accountMeta(TOKEN_PROGRAM_ID, false, false),
        accountMeta(config.unknownPda, false, false),
    ]
}

export function getAmountForComposeMsg(amount: string, payloadDataType: constants.PayloadType): number[] {
    if (
        payloadDataType === constants.PayloadType.Stake ||
        payloadDataType === constants.PayloadType.CreateOrderUnstakeRequest ||
        payloadDataType === constants.PayloadType.EsOrderUnstakeAndVest ||
        payloadDataType === constants.PayloadType.RedeemValor ||
        payloadDataType === constants.PayloadType.UnstakeOrderNow
    ) {
        return amountStrToBytes32(amount, SOLANA_AMOUNT_SCALE_FACTOR)
    }
    return amountStrToBytes32(amount)
}

// export function encodeClaimRewardPayload(
//     distributionId: number,
//     cumulativeAmount: string,
//     merkleProof: string[]
// ): Uint8Array {
//     if (!Array.isArray(merkleProof)) {
//         throw new TypeError('merkleProof must be an array')
//     }

//     const cumulativeAmountArray = amountStrToBytes32(cumulativeAmount)
//     const proofArray = merkleProof.map((p) => Array.from(Uint8Array.from(Buffer.from(p.slice(2), 'hex'))))
//     const encodedStr = defaultAbiCoder.encode(
//         ['tuple(uint32,uint256,bytes32[])'],
//         [[distributionId, cumulativeAmountArray, proofArray]]
//     )
//     // console.log('Encoded claim reward payload:', encodedStr)
//     const encodedBytes = arrayify(encodedStr)
//     return encodedBytes
// }

export function encodeUserRequestPayload(amountArray: number[]): Uint8Array {
    const encodedStr = defaultAbiCoder.encode(['tuple(uint256)'], [[amountArray]])
    // console.log('Encoded user request payload:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    return encodedBytes
}

export function encodeOCCVaultMessage(
    chainEventId: BN,
    srcChainId: number,
    token: number,
    amountArray: number[],
    sender: PublicKey,
    payloadType: number,
    payload: Uint8Array
): Uint8Array {
    const encodedStr = defaultAbiCoder.encode(
        ['tuple(uint256,uint256,uint8,uint256,bytes32,uint8,bytes)'],
        [[chainEventId.toNumber(), srcChainId, token, amountArray, sender.toBytes(), payloadType, payload]]
    )
    const encodedBytes = arrayify(encodedStr)
    // console.log('Encoded OCC vault message bytes:', encodedBytes)
    // console.log('Encoded OCC vault message length:', encodedBytes.length)
    return encodedBytes
}

export function createStakingMsg(amount: string, sender: PublicKey, ENV: string): Uint8Array {
    const amountInBytese32 = getOrderAmountInBytes32(amount)
    let token = constants.LedgerToken.ORDER
    const payload = Buffer.from('')

    // TODO: using enpacked encode
    const encodedStr = defaultAbiCoder.encode(
        ['tuple(uint256,uint256,uint8,uint256,bytes32,uint8,bytes)'],
        [
            [
                getChainEventId(),
                getSrcChainId(ENV),
                token,
                amountInBytese32,
                sender.toBytes(),
                getPayloadType().Stake,
                payload,
            ],
        ]
    )
    const encodedBytes = arrayify(encodedStr)
    return encodedBytes
}

export function getStakingOptions() {
    return Options.newOptions().addExecutorComposeOption(0, 500000, 0).toBytes() // Buffer.from('')  for deployed oft
}

export async function quoteStakingFee(wallet: Wallet, amount: string, ENV: string) {
    const orderlyEid = getOrderlyEid(ENV)
    const amountInBigInt = getOrderAmountInBigInt(amount)

    const stakingMsg = createStakingMsg(amount, wallet.publicKey, ENV)
    const rpc = getUmi(ENV).rpc
    const oftAccounts = getOftAccounts(ENV)
    const stakingOptions = getStakingOptions()
    const { lzTokenFee, nativeFee } = await oft.quote(
        rpc,
        {
            payer: fromWeb3JsPublicKey(wallet.publicKey),
            tokenMint: oftAccounts.mint,
            tokenEscrow: fromWeb3JsPublicKey(oftAccounts.escrow),
        },
        {
            dstEid: orderlyEid,
            to: oftAccounts.ledgerOccManger,
            amountLd: amountInBigInt,
            minAmountLd: 0n, // TODO: should be the same as amount for deployed oft
            options: stakingOptions,
            composeMsg: stakingMsg,
            payInLzToken: false,
        },
        {
            oft: oftAccounts.programId,
        }
    )

    console.log('✅ Quoted staking fee')
    return { lzTokenFee, nativeFee }
}

export async function sendStakingRequest(
    provider: AnchorProvider,
    wallet: Wallet,
    amount: string,
    fee: string,
    ENV: string,
    extendAlt: boolean = false
) {
    const orderlyEid = getOrderlyEid(ENV)
    const oftAccounts = getOftAccounts(ENV)
    const stakingOptions = getStakingOptions()
    const stakingMsg = createStakingMsg(amount, wallet.publicKey, ENV)
    const amountInBigInt = getOrderAmountInBigInt(amount)
    const oftSendParams = {
        dstEid: orderlyEid,
        to: oftAccounts.ledgerOccManger,
        amountLd: new BN(amountInBigInt.toString()),
        minAmountLd: new BN(0), // should be the same as amount for deployed oft
        options: Buffer.from(stakingOptions),
        composeMsg: Buffer.from(stakingMsg),
        nativeFee: new BN(fee),
        lzTokenFee: new BN(0),
    }
    const [eventAuthorityPDA] = new EventPDADeriver(oftAccounts.programId).eventAuthority()
    const oftPeerPda = getPeerPda(oftAccounts.programId, oftAccounts.oftStore, orderlyEid)
    const senderATA = getTokenATA(oftAccounts.mint, wallet.publicKey)
    const oftSendAccounts = {
        signer: wallet.publicKey,
        peer: oftPeerPda,
        oftStore: oftAccounts.oftStore,
        tokenSource: senderATA,
        tokenEscrow: oftAccounts.escrow,
        tokenMint: oftAccounts.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        eventAuthority: eventAuthorityPDA,
        program: oftAccounts.programId,
    }
    const rpc = getUmi(ENV).rpc
    const connection = new Connection(rpc.getEndpoint(), 'confirmed')

    const evmOftPeer = bytes32ToEthAddress(oftAccounts.evmOftAddress)
    const solOftPeer = publicKeyIntoHex(oftAccounts.oftStore)
    const path = {
        sender: solOftPeer,
        dstEid: orderlyEid,
        receiver: evmOftPeer,
    }
    const oftProgram = getOftProgram(ENV, provider)
    const remainingAccounts = await getSendRemainingAccounts(connection, wallet.publicKey, path)
    const ixSend = await oftProgram.methods
        .send(oftSendParams)
        .accounts(oftSendAccounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    const ixAddComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

    if (extendAlt) {
        const accountList = remainingAccounts.map((account) => account.pubkey)
        await extendALT(provider, wallet, oftAccounts.alt, accountList)
        await delay(ENV)
    }
    const tx = await createAndSendV0TxWithTable(
        [ixSend, ixAddComputeBudget],
        provider,
        wallet.publicKey,
        [wallet.payer],
        oftAccounts.alt
    )
    console.log('✅ Sent staking request')
    return tx
}

export async function quoteClaimFee(program: Program<SolanaProxy>, payer: PublicKey, ENV: string) {
    console.log('hihere', ENV)
    const { params, accounts, connection, path } = prepareParamsAndAccounts(
        program,
        payer,
        constants.PayloadType.ClaimRewardSolana,
        undefined, // no payload needed for claim request, the payload has been upload through instruction submit_proof
        ENV
    )
    const claimData = getClaimDataPda(program.programId, payer)
    const remainingAccounts = await getQuoteRemainingAccounts(connection, payer, path)
    const { lzTokenFee, nativeFee } = await program.methods
        .quoteClaim()
        .accounts({
            user: accounts.user,
            claimData: claimData,
            proxyConfig: accounts.proxyConfig,
            peerConfig: accounts.peerConfig,
        })
        .remainingAccounts(remainingAccounts)
        .view()
    console.log('lzTokenFee:', lzTokenFee.toString())
    console.log('nativeFee:', nativeFee.toString())
    return { lzTokenFee, nativeFee }
}

export async function sendClaimRequest(
    program: Program<SolanaProxy>,
    provider: AnchorProvider,
    payer: Wallet,
    nativeFee: BN,
    lzTokenFee: BN,
    ENV: string
) {
    console.log('Sending claim request')
    const { accounts, connection, path } = prepareParamsAndAccounts(
        program,
        payer.publicKey,
        constants.PayloadType.ClaimRewardSolana,
        Buffer.from(''),
        ENV
    )
    const remainingAccounts = await getSendRemainingAccounts(connection, payer.publicKey, path)
    const msgFee = {
        lzTokenFee: lzTokenFee,
        nativeFee: nativeFee,
    }
    const claimData = getClaimDataPda(program.programId, payer.publicKey)
    const claimAccounts = {
        user: payer.publicKey,
        claimData: claimData,
        proxyConfig: accounts.proxyConfig,
        peerConfig: accounts.peerConfig,
    }

    const requestIx = await program.methods
        .sendClaim(msgFee)
        .accounts(claimAccounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    const tx = await createAndSendV0Tx([requestIx], provider, payer)
    console.log('Tx to send request for Solana Proxy:', tx)
    return tx
}

export async function quoteFee(
    program: Program<SolanaProxy>,
    payer: PublicKey,
    // userAccount: PublicKey,
    payloadType: constants.PayloadType,
    payload: Uint8Array,
    ENV: string
) {
    const { params, accounts, connection, path } = prepareParamsAndAccounts(
        program,
        payer,
        // userAccount,
        payloadType,
        payload,
        ENV
    )
    const remainingAccounts = await getQuoteRemainingAccounts(connection, payer, path)
    const { lzTokenFee, nativeFee } = await program.methods
        .quoteRequest(params)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .view()
    console.log('✅ Quoted fee')
    console.log('lzTokenFee:', lzTokenFee.toString())
    console.log('nativeFee:', nativeFee.toString())
    return { lzTokenFee, nativeFee }
}

export async function sendRequest(
    program: Program<SolanaProxy>,
    provider: AnchorProvider,
    payer: Wallet,
    // userAccount: PublicKey,
    payloadType: constants.PayloadType,
    payload: Uint8Array,
    nativeFee: BN,
    lzTokenFee: BN,
    ENV: string
) {
    const { params, accounts, connection, path } = prepareParamsAndAccounts(
        program,
        payer.publicKey,
        // userAccount,
        payloadType,
        payload,
        ENV
    )
    const remainingAccounts = await getSendRemainingAccounts(connection, payer.publicKey, path)
    const msgFee = {
        lzTokenFee: lzTokenFee,
        nativeFee: nativeFee,
    }
    const requestIx = await program.methods
        .sendRequest(params, msgFee)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    const tx = await createAndSendV0Tx([requestIx], provider, payer)
    console.log('Tx to send request for Solana Proxy:', tx)
    return tx
}

function prepareParamsAndAccounts(
    program: Program<SolanaProxy>,
    payer: PublicKey,
    payloadType: constants.PayloadType,
    payload: Uint8Array = Buffer.from(''),
    ENV: string
) {
    const params = {
        payloadType: payloadType,
        payload: Buffer.from(payload),
    }
    const proxyConfigPda = getProxyConfigPda(program.programId)
    const orderlyEid = getOrderlyEid(ENV)
    const peerConfigPda = getPeerPda(program.programId, proxyConfigPda, orderlyEid)

    const accounts = {
        user: payer,
        peerConfig: peerConfigPda,
        proxyConfig: proxyConfigPda,
    }
    const rpc = getUmi(ENV).rpc
    const connection = new Connection(rpc.getEndpoint(), 'confirmed')
    const oappReceiver = bytes32ToEthAddress(getPeerAddress(ENV)!)
    const oappSender = publicKeyIntoHex(proxyConfigPda)
    const path = {
        sender: oappSender,
        dstEid: orderlyEid,
        receiver: oappReceiver,
    }
    return { params, accounts, connection, path }
}

// this function has limit on composeMsg size: 288 bytes can be sent while 320 returns error VersionedTransaction too large

export async function getTransactionWithRetries(
    txSignature: string,
    provider: AnchorProvider,
    maxRetries: number = 10,
    delay: number = 1000
): Promise<VersionedTransactionResponse> {
    let attempts = 0
    let tx = null

    while (attempts < maxRetries) {
        tx = await provider.connection.getTransaction(txSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 1,
        })

        if (tx) {
            return tx
        }

        attempts++
        await new Promise((resolve) => setTimeout(resolve, delay))
    }

    throw new Error('Transaction could not be retrieved after maximum retries')
}

export function getReturnLog(confirmedTransaction: VersionedTransactionResponse) {
    const prefix = 'Program return: '
    let log = confirmedTransaction.meta?.logMessages?.reverse().find((log) => log.startsWith(prefix))
    if (!log) {
        throw new Error('Log is undefined')
    }
    log = log.slice(prefix.length)
    const [key, data] = log.split(' ', 2)
    const buffer = Buffer.from(data, 'base64')
    return { key, data, buffer }
}

export function getEndpoint() {
    return new EndpointProgram.Endpoint(constants.ENDPOINT_PROGRAM_ID)
}

export function getInitOAppRemainingAccounts(wallet: Wallet, oapp: PublicKey) {
    const endpoint = getEndpoint()
    const accounts = endpoint.getRegisterOappIxAccountMetaForCPI(wallet.publicKey, oapp)
    // console.log('accounts:', accounts)
    // console.log('account len', accounts.length)
    return accounts
}

export function getMsgLib() {
    return new UlnProgram.Uln(constants.SEND_LIB_PROGRAM_ID)
}

type Path = {
    sender: string
    dstEid: number
    receiver: string
}
export async function getQuoteRemainingAccounts(connection: Connection, payer: PublicKey, path: Path) {
    const endpoint = getEndpoint()
    const msgLib = getMsgLib()

    const remainingAccounts = await endpoint.getQuoteIXAccountMetaForCPI(connection, payer, path, msgLib)

    return remainingAccounts
}

export async function getSendRemainingAccounts(connection: Connection, payer: PublicKey, path: Path) {
    const endpoint = getEndpoint()
    const msgLib = getMsgLib()

    const remainingAccounts = await endpoint.getSendIXAccountMetaForCPI(connection, payer, path, msgLib)
    return remainingAccounts
}

export function getUsdcMint(ENV: string) {
    return constants.PROXY_ACCOUNTS[ENV].usdcMint
}

export function getTokenATA(tokenAccount: PublicKey, owner: PublicKey) {
    const tokenATA = getAssociatedTokenAddressSync(tokenAccount, owner, true)
    return tokenATA
}

export function getOrderlyEid(ENV: string) {
    if (ENV === 'mainnet') {
        return EndpointId.ORDERLY_V2_MAINNET
    } else {
        return EndpointId.ORDERLY_V2_TESTNET
    }
}

export function getSolanaChainId(ENV: string): number {
    if (ENV === 'mainnet') {
        return constants.MAIN_SOL_CHAIN_ID
    }
    return constants.DEV_SOL_CHAIN_ID
}

export function getChainEventId() {
    return constants.CHAIN_EVENT_ID_PLACEHOLDER
}

export function getSrcChainId(ENV: string): number {
    return constants.SOLANA_INFO[ENV].solChainId
}

export function getPeerAddress(ENV: string) {
    return constants.PEER_ADDRESS[ENV]
}

export function getOptions(ENV: string) {
    checkENV(ENV)
    return constants.OPTIONS[ENV]
}

export function getLzConfig(orderlyEid: number) {
    if (constants.LZ_CONFIG[orderlyEid]) {
        return constants.LZ_CONFIG[orderlyEid]
    }
    throw new Error('Invalid orderly eid')
}

export function getEncodedOptions(options: any) {
    const optionSend = Options.newOptions()
        .addExecutorLzReceiveOption(options.LZ_RECEIVE_GAS, options.LZ_RECEIVE_VALUE)
        .toBytes()
    const optionSendAndCall = Options.newOptions()
        .addExecutorLzReceiveOption(options.LZ_RECEIVE_GAS, options.LZ_RECEIVE_VALUE)
        .addExecutorComposeOption(0, options.LZ_COMPOSE_GAS, options.LZ_COMPOSE_VALUE)
        .toBytes()
    return [optionSend, optionSendAndCall]
}

export function intoIx(wrappedIx: WrappedInstruction[]) {
    return wrappedIx.map((wrapped) => toWeb3JsInstruction(wrapped.instruction))
}

export async function delay(ENV: string) {
    if (ENV === constants.ENV[4]) {
        // sleep for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
}

export function publicKeyIntoHex(publicKey: PublicKey): string {
    return Buffer.from(publicKey.toBytes()).toString('hex')
}

export function getPayloadType() {
    return constants.PayloadType
}

export function checkPayloadType(payloadType: number | string): constants.PayloadType {
    if (!isNaN(Number(payloadType))) {
        payloadType = Number(payloadType)
    }

    if (typeof payloadType === 'string') {
        payloadType = payloadType.toLowerCase()
    }

    switch (payloadType) {
        case 1:
        case 'stake':
            return constants.PayloadType.Stake
        case 2:
        case 'createorderunstakerequest':
            return constants.PayloadType.CreateOrderUnstakeRequest
        case 3:
        case 'cancelorderunstakerequest':
            return constants.PayloadType.CancelOrderUnstakeRequest
        case 4:
        case 'withdraworder':
            return constants.PayloadType.WithdrawOrder
        case 5:
        case 'esorderunstakeandvest':
            return constants.PayloadType.EsOrderUnstakeAndVest
        case 6:
        case 'cancelvestingrequest':
            return constants.PayloadType.CancelVestingRequest
        case 8:
        case 'claimvestingrequest':
            return constants.PayloadType.ClaimVestingRequest
        case 9:
        case 'redeemvalor':
            return constants.PayloadType.RedeemValor
        case 10:
        case 'claimusdcrevenue':
            return constants.PayloadType.ClaimUsdcRevenue
        case 15:
        case 'unstakeordernow':
            return constants.PayloadType.UnstakeOrderNow
        default:
            throw new Error(`Unsupported payload type: ${payloadType}`)
    }
}

export function getPayload(payloadType: constants.PayloadType, payload: string) {
    if (payloadType === constants.PayloadType.Stake) {
        if (payload) {
            return amountStrToBytes32(payload, constants.ORDER_DECIMALS_ON_ETHEREUM)
        }
        throw new Error('Payload is required for staking')
    }
}

// @dev: get the ORDER amount in ETHEREUM DECIMALS: 18
export function getOrderAmountInBytes32(amount: string) {
    const bigNumber = ethers.BigNumber.from(amount).mul(constants.ORDER_DECIMALS_ON_ETHEREUM)
    const bytes32 = ethers.utils.zeroPad(bigNumber.toHexString(), 32)
    return Array.from(bytes32)
}

// @dev: get the ORDER amount in SOLANA DECIMALS: 10
export function getOrderAmountInBigInt(amount: string) {
    const bigNumber = ethers.BigNumber.from(amount).mul(constants.ORDER_DECIMALS_ON_SOLANA)
    return bigNumber.toBigInt()
}

function checkENV(ENV: string) {
    if (!constants.ENV.includes(ENV)) {
        throw new Error(`Invalid environment: ${ENV}`)
    }
}
