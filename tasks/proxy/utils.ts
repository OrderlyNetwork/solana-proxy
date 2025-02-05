import { PathOrFileDescriptor, readFileSync } from 'fs'

import fs from 'fs'
import { join } from 'path'
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

// const LOCALHOST_RPC_URL = 'http://localhost:8899'
// const SOLANA_DEVNET_RPC_URL = 'https://api.devnet.solana.com'
// const SOLANA_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com'
// const SOLANA_AMOUNT_SCALE_FACTOR = ethers.BigNumber.from('100000000')

export function setUpEnv(ENV: string) {
    const [provider, wallet, rpc] = setupAnchor(ENV)
    const proxyProgram = getDeployedProxyProgram(ENV, provider)
    const oftProgram = getDeployedOftProgram(ENV, provider)
    // const endpoint = getEndpoint()
    // const usdcTokenAccount = getUsdcTokenAccount(ENV)
    const orderlyEid = getOrderlyEid(ENV)
    const solChainId = getSolanaChainId(ENV)
    return [provider, wallet, rpc, proxyProgram, orderlyEid, solChainId]
}

export function setupAnchor(ENV: string): [AnchorProvider, Wallet, string] {
    let ANCHOR_PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL
    if (!ANCHOR_PROVIDER_URL) {
        process.env.ANCHOR_PROVIDER_URL = constants.SOLANA_RPC_URLS[ENV]
    }
    const provider = AnchorProvider.env()
    setProvider(provider)
    const rpc = provider.connection.rpcEndpoint
    console.log(`Running on ${ENV} environment. Rpc: ${rpc}`)
    const wallet = provider.wallet as Wallet
    return [provider, wallet, rpc]
}

export function getUmi(ENV: string) {
    return createUmi(constants.SOLANA_RPC_URLS[ENV])
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

// export function getConfigPath() {
//     const ENV = getEnv()
//     return join(__dirname, `../../config/${ENV.toLowerCase()}.json`)
// }

let configSingleton: any = null

// export function getConfig(): any {
//     if (configSingleton) {
//         return configSingleton
//     }

//     const configPath = getConfigPath()
//     try {
//         const config = JSON.parse(readFileSync(configPath, 'utf-8'))
//         return config
//     } catch (error) {
//         if (error instanceof Error) {
//             throw new Error(`Failed to load config file at ${configPath}: ${error.message}`)
//         } else {
//             throw new Error(`Failed to load config file at ${configPath}: Unknown error`)
//         }
//     }
// }

export function updateConfig(config: any) {
    console.log('Updated config:', config)
    const configPath = getConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(`Config saved to ${configPath}\n`)
    configSingleton = null
}

export function getDeployedProxyProgram(ENV: string, provider: AnchorProvider): Program<SolanaProxy> {
    console.log('Proxy program ID:', constants.PROXY_ACCOUNTS[ENV].programId.toString())
    return new Program<SolanaProxy>(proxyIDL, constants.PROXY_ACCOUNTS[ENV].programId.toString(), provider)
}

export function getDeployedOftProgram(ENV: string, provider: AnchorProvider): Program<Oft> {
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

    console.log('latestBlockhash:', latestBlockhash)
    console.log('txInstructions:', txInstructions.keys)

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

export async function getOftSendAccounts(
    provider: AnchorProvider,
    oftProgramIdStr: string,
    oftEscrowAtaStr: string,
    signerPubKey: PublicKey,
    dstEid: number
): Promise<MetaplexAccountMeta[]> {
    const { oftProgramId, tokenEscrow, tokenMint, oftStore, peer } = await getCommonOftAccounts(
        provider,
        oftProgramIdStr,
        oftEscrowAtaStr,
        dstEid
    )

    const signerAta = await getAssociatedTokenAddress(toWeb3JsPublicKey(tokenMint), signerPubKey, true)
    const [eventAuthorityPDA] = new EventPDADeriver(new PublicKey(oftProgramIdStr)).eventAuthority()
    const tokenProgram = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)

    const txBuilder = instructions.send(
        { programs: oft.createOFTProgramRepo(oftProgramId) },
        {
            signer: createNoopSigner(fromWeb3JsPublicKey(signerPubKey)),
            peer: peer,
            oftStore: oftStore,
            tokenSource: fromWeb3JsPublicKey(signerAta),
            tokenEscrow: tokenEscrow,
            tokenMint: tokenMint,
            tokenProgram: tokenProgram,
            eventAuthority: fromWeb3JsPublicKey(eventAuthorityPDA),
            program: oftProgramId,

            // The following parameters can be any value and will not affect obtaining the accounts.
            ...fakeSendInstructionData(dstEid),
            nativeFee: 0n,
            lzTokenFee: 0n,
        }
    )

    const ix = txBuilder.items[0]

    return [...ix.instruction.keys]
}

export async function getRemainingOftSendAccounts(
    provider: AnchorProvider,
    oftProgramIdStr: string,
    oftEscrowAtaStr: string,
    signerPubKey: PublicKey,
    dstEid: number
): Promise<MetaplexAccountMeta[]> {
    const { oftStore, peerInfo, sendHelper } = await getCommonOftAccounts(
        provider,
        oftProgramIdStr,
        oftEscrowAtaStr,
        dstEid
    )

    // Get remaining accounts from msgLib(simple_msgLib or uln)
    const remainAccounts = (
        await sendHelper.getSendAccounts(
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

    return remainAccounts
}

export async function getAllOftSendAccounts(
    provider: AnchorProvider,
    oftProgramIdStr: string,
    oftEscrowAtaStr: string,
    signerPubKey: PublicKey,
    dstEid: number
): Promise<MetaplexAccountMeta[]> {
    const { oftProgramId, tokenEscrow, tokenMint, oftStore, peer, peerInfo, sendHelper } = await getCommonOftAccounts(
        provider,
        oftProgramIdStr,
        oftEscrowAtaStr,
        dstEid
    )

    const signerAta = await getAssociatedTokenAddress(toWeb3JsPublicKey(tokenMint), signerPubKey, true)
    const [eventAuthorityPDA] = new EventPDADeriver(new PublicKey(oftProgramIdStr)).eventAuthority()
    const tokenProgram = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)

    const txBuilder = instructions.send(
        { programs: oft.createOFTProgramRepo(oftProgramId) },
        {
            signer: createNoopSigner(fromWeb3JsPublicKey(signerPubKey)),
            peer: peer,
            oftStore: oftStore,
            tokenSource: fromWeb3JsPublicKey(signerAta),
            tokenEscrow: tokenEscrow,
            tokenMint: tokenMint,
            tokenProgram: tokenProgram,
            eventAuthority: fromWeb3JsPublicKey(eventAuthorityPDA),
            program: oftProgramId,

            // The following parameters can be any value and will not affect obtaining the accounts.
            ...fakeSendInstructionData(dstEid),
            nativeFee: 0n,
            lzTokenFee: 0n,
        }
    )

    // Get remaining accounts from msgLib(simple_msgLib or uln)
    const ix = txBuilder.addRemainingAccounts(
        (
            await sendHelper.getSendAccounts(
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

function accountMeta(pubkey: string | PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
    return { pubkey: (pubkey = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey), isSigner, isWritable }
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

export function getAccountsForEndpointV2Send(signer: string | PublicKey, signerSigns: boolean): AccountMeta[] {
    const config = getConfig()
    return [
        // ----------- Endpoint V2 send addresses -----------
        accountMeta(config.endpointV2ProgramId, false, false),
        accountMeta(config.oftStorePda, false, false),
        accountMeta(config.sendLibProgramId, false, false),
        accountMeta(config.sendLibConfigPda, false, false),
        accountMeta(config.defaultSendLibConfigPda, false, false),
        accountMeta(config.sendLibInfoPda, false, false),
        accountMeta(config.endpointSettingsPda, false, false),
        accountMeta(config.noncePda, false, true),
        // ----------- Unknown part -----------
        accountMeta(config.eventAuthorityPda, false, false),
        accountMeta(config.endpointV2ProgramId, false, false),
        accountMeta(config.ulnSettingsPda, false, false),
        accountMeta(config.sendConfigPda, false, false),
        accountMeta(config.defaultSendConfigPda, false, false),
        accountMeta(signer, signerSigns, false),
        accountMeta(config.treasuryProgramId, false, false),
        accountMeta(SystemProgram.programId, false, false),
        accountMeta(config.ulnEventAuthorityPda, false, false),
        // ----------- Send (Message) Library send addresses -----------
        accountMeta(config.sendLibProgramId, false, false),
        accountMeta(config.executorProgramId, false, false),
        accountMeta(config.executorConfigPda, false, true),
        accountMeta(config.priceFeedProgramId, false, false),
        accountMeta(config.priceFeedConfigPda, false, false),
        accountMeta(config.dvnProgramId, false, false),
        accountMeta(config.dvnConfigPda, false, true),
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

export function encodeClaimRewardPayload(
    distributionId: number,
    cumulativeAmount: string,
    merkleProof: string[]
): Uint8Array {
    if (!Array.isArray(merkleProof)) {
        throw new TypeError('merkleProof must be an array')
    }

    const cumulativeAmountArray = amountStrToBytes32(cumulativeAmount)
    const proofArray = merkleProof.map((p) => Array.from(Uint8Array.from(Buffer.from(p.slice(2), 'hex'))))
    const encodedStr = defaultAbiCoder.encode(
        ['tuple(uint32,uint256,bytes32[])'],
        [[distributionId, cumulativeAmountArray, proofArray]]
    )
    // console.log('Encoded claim reward payload:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    return encodedBytes
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
    // console.log('Encoded OCC vault message:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    // console.log('Encoded OCC vault message bytes:', encodedBytes)
    // console.log('Encoded OCC vault message length:', encodedBytes.length)
    return encodedBytes
}

export function createComposeMsgForStaking(
    srcChainId: number,
    payloadDataType: PayloadType,
    amount: number[],
    chainEventId: BN,
    sender: PublicKey
): Uint8Array {
    let payload: Uint8Array
    let token = constants.LedgerToken.ORDER
    // let amountArray = getAmountForComposeMsg(amount, payloadDataType)
    payload = Buffer.from('') // empty payload for staking
    return encodeOCCVaultMessage(chainEventId, srcChainId, token, amount, sender, payloadDataType, payload)
}

// this function has limit on composeMsg size: 288 bytes can be sent while 320 returns error VersionedTransaction too large
export async function oftSendWithComposeMsg(provider: AnchorProvider, amount: string, composeMsg: Uint8Array) {
    const wallet = provider.wallet as Wallet
    const umi = createUmi(provider.connection.rpcEndpoint).use(mplToolbox())
    const umiWalletKeyPair = umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey)
    const umiWalletSigner = createSignerFromKeypair(umi, umiWalletKeyPair)
    umi.use(signerIdentity(umiWalletSigner))

    const config = getConfig()
    const oftProgramId = metaplexPublicKey(config.oftProgramId)
    const mint = metaplexPublicKey(config.mintPda)
    const umiEscrowPublicKey = metaplexPublicKey(config.oftEscrowAta)
    const tokenProgramId = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)

    const userTokenPda = findAssociatedTokenPda(umi, {
        mint: metaplexPublicKey(config.mintPda),
        owner: fromWeb3JsPublicKey(wallet.publicKey),
        tokenProgramId,
    })

    if (!userTokenPda) {
        throw new Error(
            `No token account found for mint ${config.mintPda} and owner ${wallet.publicKey} in program ${tokenProgramId}`
        )
    }

    const occManagerAddressBytes32 = addressToBytes32(config.occManagerAddress)
    const toEid = getOrderlyEid()
    const fromEid = getSolanaEid()
    const computeUnitPriceScaleFactor = 4
    // Defining extra message execution options for the send operation
    const options = Options.newOptions().addExecutorComposeOption(0, 300000, 0).toBytes()

    const { nativeFee } = await oft.quote(
        umi.rpc,
        {
            payer: fromWeb3JsPublicKey(wallet.publicKey),
            tokenMint: mint,
            tokenEscrow: umiEscrowPublicKey,
        },
        {
            dstEid: toEid,
            to: occManagerAddressBytes32,
            amountLd: BigInt(amount),
            minAmountLd: 1n,
            options: options,
            payInLzToken: false,
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
            tokenSource: userTokenPda[0],
        },
        {
            dstEid: toEid,
            to: occManagerAddressBytes32,
            amountLd: BigInt(amount),
            minAmountLd: 1n,
            options: options,
            composeMsg,
            nativeFee,
        },
        {
            oft: oftProgramId,
            token: tokenProgramId,
        }
    )

    let txBuilder = transactionBuilder([ix])
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
    printTxLinks(transactionSignatureBase58)
}

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
    console.log('accounts:', accounts)
    console.log('account len')
    return accounts
}

// export function getInitOAppRemainingAccounts(wallet: Wallet, oapp: PublicKey) {
//     const endpoint = getEndpoint()
//     return endpoint.getRegisterOappIxAccountMetaForCPI(wallet.publicKey, oapp).map((acc) => {
//         return {
//             pubkey: acc.pubkey,
//             isSigner: acc.isSigner,
//             isWritable: acc.isWritable,
//         }
//     })
// }

export function getMsgLib() {
    return new UlnProgram.Uln(constants.SEND_LIB_PROGRAM_ID)
}

type Path = {
    sender: string
    dstEid: number
    receiver: string
}
export async function getQuoteRemainingAccounts(connection: Connection, wallet: Wallet, path: Path) {
    // console.log('path:', path)
    const endpoint = getEndpoint()
    const msgLib = getMsgLib()

    const remainingAccounts = await endpoint.getQuoteIXAccountMetaForCPI(connection, wallet.publicKey, path, msgLib)
    // console.log('remaining accounts:', remainingAccounts)
    // console.log('remaining accounts length:', remainingAccounts.length)

    return remainingAccounts
}

export async function getSendRemainingAccounts(connection: Connection, wallet: Wallet, path: Path) {
    const endpoint = getEndpoint()
    const msgLib = getMsgLib()

    const remainingAccounts = await endpoint.getSendIXAccountMetaForCPI(connection, wallet.publicKey, path, msgLib)
    return remainingAccounts
}

// export function getProxyProgramId(ENV: string) {
//     if (ENV === 'local') {
//         return constants.LOCAL_PROXY_PROGRAM_ID
//     } else if (ENV === 'dev') {
//         return constants.DEV_PROXY_PROGRAM_ID
//     } else if (ENV === 'qa') {
//         return constants.QA_PROXY_PROGRAM_ID
//     } else if (ENV === 'staging') {
//         return constants.STAGING_PROXY_PROGRAM_ID
//     } else if (ENV === 'mainnet') {
//         return constants.MAIN_PROXY_PROGRAM_ID
//     }
// }

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

export function getChainEventId(ENV: string): BN {
    return constants.CHAIN_EVENT_ID
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
    if (ENV === 'mainnet') {
        // sleep for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000))
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

function checkENV(ENV: string) {
    if (!constants.ENV.includes(ENV)) {
        throw new Error(`Invalid environment: ${ENV}`)
    }
}
