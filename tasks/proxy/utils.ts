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
import { getBackwardFeePda, getClaimDataPda, getPeerPda, getProxyConfigPda } from './pdaHelper'

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

export function getProxyAccounts(ENV: string) {
    return constants.PROXY_ACCOUNTS[ENV]
}

export function getSolanaEid(ENV: string): number {
    if (ENV === constants.ENV[3]) {
        return EndpointId.SOLANA_V2_MAINNET
    }
    return EndpointId.SOLANA_V2_TESTNET
}

export function isDevnet(ENV: string): boolean {
    return ENV !== constants.ENV[3]
}

export function getProxyProgram(ENV: string, provider: AnchorProvider): Program<SolanaProxy> {
    console.log('Proxy program ID:', constants.PROXY_ACCOUNTS[ENV].programId.toString())
    return new Program<SolanaProxy>(proxyIDL, constants.PROXY_ACCOUNTS[ENV].programId.toString(), provider)
}

export function getOftProgram(ENV: string, provider: AnchorProvider): Program<Oft> {
    return new Program<Oft>(oftIDL, constants.OFT_ACCOUNTS[ENV].programId.toString(), provider)
}

export function convertIntoBytes32(amountStr: string, scaleFactor: ethers.BigNumber = ethers.BigNumber.from('1')) {
    const bigNumber = ethers.BigNumber.from(amountStr).mul(scaleFactor)
    const bytes32 = ethers.utils.zeroPad(bigNumber.toHexString(), 32)
    return Array.from(bytes32)
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

export function printTxLinks(ENV: string, txid: string) {
    console.log(`Solana transaction:    ${getExplorerTxLink(txid, isDevnet(ENV))}`)
    console.log(`LzyerZero transaction: ${getLayerZeroScanLink(txid, isDevnet(ENV))}`)
}

export function printProxyConfig(proxyConfig: any) {
    console.log('Admin:', proxyConfig.admin.toString())
    console.log('Endpoint Program:', proxyConfig.endpointProgram.toString())
    console.log('Orderly EID:', proxyConfig.orderlyEid)
    console.log('Solana Chain ID:', proxyConfig.solChainId)
    console.log('USDC Token Account:', proxyConfig.usdcTokenAccount.toString())
    console.log('Paused:', proxyConfig.paused)
}

export function printBackwardFee(backwardFee: any) {
    console.log('ORDER Backward Fee:', backwardFee.orderBackwardFee.toString())
    console.log('USDC Backward Fee:', backwardFee.usdcBackwardFee.toString())
}

export function printOptions(options: any, enforcedOptions: any) {
    const [optionSend, optionSendAndCall] = getEncodedOptions(options)
    console.log(
        `The option config for send: receive gas = ${options.LZ_RECEIVE_GAS}, receive value = ${options.LZ_RECEIVE_VALUE}`
    )
    console.log(`The option config into bytes:    `, Buffer.from(optionSend).toString('hex'))
    console.log(`The option set onchain for send: `, Buffer.from(enforcedOptions.send).toString('hex'))
    console.log(
        `The option config for sendAndCall: receive gas = ${options.LZ_RECEIVE_GAS}, receive value = ${options.LZ_RECEIVE_VALUE}, compose gas = ${options.LZ_COMPOSE_GAS}, compose value = ${options.LZ_COMPOSE_VALUE}`
    )
    console.log(`The option config into bytes:           `, Buffer.from(optionSendAndCall).toString('hex'))
    console.log(`The option set onchain for sendAndCall: `, Buffer.from(enforcedOptions.sendAndCall).toString('hex'))
}

export function printEndpointConfig(endpointConfig: any) {
    console.log(`Endpoint config - send lib config: `) // , endpointConfig.sendLibraryConfig
    console.log(`    - messageLib: `, endpointConfig.sendLibraryConfig.messageLib.toString())
    console.log(`    - uln sendConfig: `)
    console.log(`        - uln: `)
    console.log(
        `           - confirmation: `,
        endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.confirmations.toString()
    )
    console.log(
        `           - requiredDvns:: `,
        endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.requiredDvns.toString()
    )
    console.log(`           - requiredDvnCount: `, endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.requiredDvnCount)
    console.log(
        `           - optionalDvns: `,
        endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.optionalDvns.toLocaleString()
    )
    console.log(`           - optionalDvnCount: `, endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.optionalDvnCount)
    console.log(
        `           - optionalDvnThreshold: `,
        endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.optionalDvnThreshold
    )
    console.log(`        - executor: `)
    console.log(
        `           - maxMessageSize: `,
        endpointConfig.sendLibraryConfig.ulnSendConfig?.executor.maxMessageSize
    )
    console.log(`           - executor: `, endpointConfig.sendLibraryConfig.ulnSendConfig?.executor.executor.toString())

    console.log(`Endpoint config - receive lib config: `) // , endpointConfig.receiveLibraryConfig
    console.log(`    - messageLib: `, endpointConfig.receiveLibraryConfig.messageLib.toString())
    console.log(`    - timeout: `, endpointConfig.receiveLibraryConfig.timeout)
    console.log(`    - uln receiveConfig: `)
    console.log(`        - uln: `)
    console.log(
        `           - confirmation: `,
        endpointConfig.receiveLibraryConfig.ulnReceiveConfig?.uln.confirmations.toString()
    )
    console.log(
        `           - requiredDvns:: `,
        endpointConfig.receiveLibraryConfig.ulnReceiveConfig?.uln.requiredDvns.toString()
    )
    console.log(
        `           - requiredDvnCount: `,
        endpointConfig.receiveLibraryConfig.ulnReceiveConfig?.uln.requiredDvnCount
    )
    console.log(
        `           - optionalDvns: `,
        endpointConfig.receiveLibraryConfig.ulnReceiveConfig?.uln.optionalDvns.toLocaleString()
    )
    console.log(
        `           - optionalDvnCount: `,
        endpointConfig.receiveLibraryConfig.ulnReceiveConfig?.uln.optionalDvnCount
    )
    console.log(
        `           - optionalDvnThreshold: `,
        endpointConfig.receiveLibraryConfig.ulnReceiveConfig?.uln.optionalDvnThreshold
    )
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
    const sendOptions = {
        skipPreflight: true,
        maxRetries: 5,
        commitment: 'confirmed',
    }
    const txid = await provider.sendAndConfirm(transaction, [wallet.payer])
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
    // const amountInBytese32 = getOrderAmountInBytes32(amount)
    // let token = constants.LedgerToken.ORDER
    // const payload = Buffer.from('')

    // TODO: using enpacked encode
    // const encodedStr = defaultAbiCoder.encode(
    //     ['tuple(uint256,uint256,uint8,uint256,bytes32,uint8,bytes)'],
    //     [
    //         [
    //             getChainEventId(),
    //             getSolChainId(ENV),
    //             token,
    //             amountInBytese32,
    //             sender.toBytes(),
    //             getPayloadType().Stake,
    //             payload,
    //         ],
    //     ]
    // )
    // console.log('encodedStr:', encodedStr)

    const encodedBytes = arrayify('1')
    return encodedBytes
}

export function getStakingOptions() {
    // Due to the tx size limit, we need to use empty options or only add executor compose option,
    // return Options.newOptions().addExecutorComposeOption(0, 500000, 0).toBytes() // Buffer.from('')  for deployed oft
    // based on the configuration already set on the OFT contract, we can use empty options
    return Buffer.from('')
}

export async function quoteStakingFee(wallet: Wallet, amount: string, ENV: string) {
    const orderlyEid = getOrderlyEid(ENV)
    const amountInBigInt = getOrderAmountInBigInt(amount)
    console.log('amountInBigInt:', amountInBigInt)
    console.log(orderlyEid)
    const stakingMsg = createStakingMsg(amount, wallet.publicKey, ENV)
    console.log('stakingMsg:', stakingMsg)
    const rpc = getUmi(ENV).rpc
    const oftAccounts = getOftAccounts(ENV)
    const stakingOptions = getStakingOptions()
    console.log('stakingOptions:', stakingOptions)

    const accounts = {
        payer: fromWeb3JsPublicKey(wallet.publicKey),
        tokenMint: oftAccounts.mint,
        tokenEscrow: fromWeb3JsPublicKey(oftAccounts.escrow),
    }
    const quoteParams = {
        dstEid: orderlyEid,
        to: oftAccounts.ledgerOccManger,
        amountLd: amountInBigInt,
        minAmountLd: amountInBigInt, // TODO: should be the same as amount for deployed oft
        options: stakingOptions,
        composeMsg: Buffer.from(stakingMsg),
        payInLzToken: false,
    }
    const quoteProgram = {
        oft: oftAccounts.programId,
    }
    console.log('accounts:', accounts)
    console.log('quoteParams:', quoteParams)
    console.log('quoteProgram:', quoteProgram)
    const { lzTokenFee, nativeFee } = await oft.quote(rpc, accounts, quoteParams, quoteProgram)

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
        minAmountLd: new BN(amountInBigInt.toString()), // should be the same as amount for deployed oft
        options: Buffer.from(stakingOptions),
        composeMsg: Buffer.from(stakingMsg),
        nativeFee: new BN(fee),
        lzTokenFee: new BN(0),
    }

    console.log(stakingMsg)
    const [eventAuthorityPDA] = new EventPDADeriver(oftAccounts.programId).eventAuthority()
    console.log('eventAuthorityPDA:', eventAuthorityPDA)
    const oftPeerPda = getPeerPda(oftAccounts.programId, oftAccounts.oftStore, orderlyEid)
    console.log('oftPeerPda:', oftPeerPda)
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
    const { params, accounts, connection, path } = prepareParamsAndAccounts(
        program,
        payer,
        constants.PayloadType.ClaimRewardSolana,
        undefined, // no payload needed for claim request, the payload has been upload through instruction submit_proof
        ENV
    )
    const claimData = getClaimDataPda(program.programId, payer)
    const backwardFeePda = getBackwardFeePda(program.programId)
    const remainingAccounts = await getQuoteRemainingAccounts(connection, payer, path)
    const { lzTokenFee, nativeFee } = await program.methods
        .quoteClaim()
        .accounts({
            user: accounts.user,
            claimData: claimData,
            proxyConfig: accounts.proxyConfig,
            peerConfig: accounts.peerConfig,
            backwardFee: backwardFeePda,
        })
        .remainingAccounts(remainingAccounts)
        .view()
    console.log('lzTokenFee:', lzTokenFee.toString())
    console.log('nativeFee:', nativeFee.toString())
    return { lzTokenFee, nativeFee }
}

export async function submitProof(
    program: Program<SolanaProxy>,
    provider: AnchorProvider,
    user: PublicKey,
    wallet: Wallet,
    distributionId: number,
    cumulativeAmount: string,
    merkleProof: string[]
) {
    const cumulativeAmountArray = convertIntoBytes32(cumulativeAmount, constants.ORDER_DECIMALS_ON_ETHEREUM)
    const proofArray = merkleProof.map((p: string) => Array.from(Uint8Array.from(Buffer.from(p, 'hex'))))
    const claimRewardParams = {
        distributionId: distributionId,
        cumulativeAmount: cumulativeAmountArray,
        merkleProof: proofArray,
    }

    const claimDataPda = getClaimDataPda(program.programId, user)
    const proxyConfigPda = getProxyConfigPda(program.programId)
    const claimRewardAccounts = {
        user: user,
        claimData: claimDataPda,
        proxyConfig: proxyConfigPda,
    }

    const ixSubmitProof = await program.methods
        .submitProof(claimRewardParams)
        .accounts(claimRewardAccounts)
        .instruction()
    // const addComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
    const txSig = await createAndSendV0Tx([ixSubmitProof], provider, wallet)
    // console.log('Tx to submit claim proof to Solana Proxy:', txSig)
    return txSig
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
    const backwardFeePda = getBackwardFeePda(program.programId)
    const claimAccounts = {
        user: payer.publicKey,
        claimData: claimData,
        proxyConfig: accounts.proxyConfig,
        peerConfig: accounts.peerConfig,
        backwardFee: backwardFeePda,
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

export function prepareParamsAndAccounts(
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
    const backwardFeePda = getBackwardFeePda(program.programId)

    const accounts = {
        user: payer,
        peerConfig: peerConfigPda,
        proxyConfig: proxyConfigPda,
        backwardFee: backwardFeePda,
    }
    const rpc = getUmi(ENV).rpc
    const connection = new Connection(rpc.getEndpoint(), 'confirmed')
    const oappReceiver = getLedgerOAppAddress(ENV)
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
    if (ENV === constants.ENV[3]) {
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

export function getSolChainId(ENV: string): number {
    return constants.SOLANA_INFO[ENV].solChainId
}

export function getBackwardFee() {
    return {
        orderBackwardFee: constants.ORDER_BACKWARD_FEE,
        usdcBackwardFee: constants.USDC_BACKWARD_FEE,
    }
}

export function getPeerAddress(ENV: string) {
    return constants.PROXY_ACCOUNTS[ENV].peerAddress
}

// export function getLedgerOAppAddress(ENV: string) {
//     return constants.LEDGER_OAPP_ACCOUNTS[ENV].proxy
// }

export function getOptions(ENV: string, localNetwork: string) {
    checkENV(ENV)
    if (localNetwork === 'soldev' || localNetwork === 'solana') {
        return constants.OPTIONS_TO_ORDERLY[ENV]
    } else if (localNetwork === 'orderlysepolia' || localNetwork === 'orderly') {
        return constants.OPTIONS_TO_SOLANA[ENV]
    } else {
        throw new Error(`Invalid local network: ${localNetwork}`)
    }
}

export function getLzConfig(orderlyEid: number) {
    if (constants.LZ_CONFIG[orderlyEid]) {
        return constants.LZ_CONFIG[orderlyEid]
    }
    throw new Error('Invalid orderly eid')
}

export function getLocalLzConfig(localNetwork: string) {
    if (localNetwork === 'soldev') {
        return constants.LZ_CONFIG.soldev
    } else if (localNetwork === 'solana') {
        return constants.LZ_CONFIG.solana
    } else if (localNetwork === 'orderlysepolia') {
        return constants.LZ_CONFIG.orderlysepolia
    } else if (localNetwork === 'orderly') {
        return constants.LZ_CONFIG.orderly
    } else {
        throw new Error(`Invalid local network: ${localNetwork}`)
    }
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
    if (ENV === constants.ENV[3]) {
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

export function checkPayload(payloadType: constants.PayloadType, payload: string) {
    let encodedPayload
    if (
        payloadType === getPayloadType().CreateOrderUnstakeRequest ||
        payloadType === getPayloadType().CancelOrderUnstakeRequest ||
        payloadType === getPayloadType().WithdrawOrder ||
        payloadType === getPayloadType().EsOrderUnstakeAndVest ||
        // TODO: check USDC and Valor decimal
        payloadType === getPayloadType().UnstakeOrderNow
    ) {
        encodedPayload = convertIntoBytes32(payload, constants.ORDER_DECIMALS_ON_ETHEREUM)
    } else if (
        payloadType === getPayloadType().CancelVestingRequest ||
        payloadType === getPayloadType().CancelAllVestingRequests || // Not supported anymore. Do not remove for backward compatibility
        payloadType === getPayloadType().ClaimVestingRequest ||
        payloadType === getPayloadType().RedeemValor ||
        payloadType === getPayloadType().ClaimUsdcRevenue
    ) {
        encodedPayload = convertIntoBytes32(payload)
    } else {
        throw new Error('Invalid payload type')
    }
    return encodedPayload
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

export function checkENV(ENV: string) {
    if (!constants.ENV.includes(ENV)) {
        throw new Error(`Invalid environment: ${ENV}`)
    }
}

export function getSolanaNetwork(ENV: string) {
    if (ENV === constants.ENV[3]) {
        return 'solana'
    }
    return 'soldev'
}

// ================================ Utility functions for LedgerOApp ================================

export function checkOrderlyNetwork(network: string) {
    if (network !== 'orderlysepolia' && network !== 'orderly') {
        throw new Error(`LedgerOApp is only supported on Orderly chain`)
    }
}

export function getOrderlyNetwork(ENV: string) {
    if (ENV === constants.ENV[3]) {
        return 'orderly'
    }
    return 'orderlysepolia'
}

export function getLedgerOAppAddress(ENV: string) {
    return constants.LEDGER_OAPP_ACCOUNTS[ENV].proxy
}

export function getOccManagerAddress(ENV: string) {
    return constants.LEDGER_OAPP_ACCOUNTS[ENV].occManager
}

export function equalDVNs<T>(dvn1: T[], dvn2: T[]): boolean {
    if (dvn1.length !== dvn2.length) {
        return false
    }

    // Sort both arrays
    const sortedDvn1 = dvn1.slice().sort()
    const sortedDvn2 = dvn2.slice().sort()

    // Compare each element
    for (let i = 0; i < sortedDvn1.length; i++) {
        if (sortedDvn1[i] !== sortedDvn2[i]) {
            return false
        }
    }

    return true
}
