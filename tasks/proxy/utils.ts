import { readFileSync } from 'fs'
import fs from 'fs'
import { join } from 'path'

import {
    AccountMeta,
    PublicKey,
    Signer,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    VersionedTransactionResponse,
} from '@solana/web3.js'
import { AnchorProvider, BN, Program, setProvider, Wallet } from '@coral-xyz/anchor'
import {
    getAccount,
    getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { OftPDA, accounts, oft, instructions } from '@layerzerolabs/oft-v2-solana-sdk'
import { EventPDADeriver, SendHelper } from '@layerzerolabs/lz-solana-sdk-v2'
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
import { arrayify, hexlify } from '@layerzerolabs/lz-utilities'
import { ethers } from 'ethers'
import { defaultAbiCoder } from '@ethersproject/abi'
import { isAddress } from 'web3-validator'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { EndpointId } from '@layerzerolabs/lz-definitions'

import { IDL, SolanaProxy } from '../../target/types/solana_proxy'
import { IDL as oftIDL, Oft } from '../../target/types/oft'
import { addComputeUnitInstructions, getExplorerTxLink, getLayerZeroScanLink } from '../solana'
import { assert } from '@layerzerolabs/lz-utilities'
import * as borsh from 'borsh'

const PROXY_CONFIG_SEED = 'ProxyConfig'
const VALID_ENVS = ['LOCAL', 'DEV', 'QA', 'STAGING', 'PROD']
const LOCALHOST_RPC_URL = 'http://localhost:8899'
const SOLANA_DEVNET_RPC_URL = 'https://api.devnet.solana.com'
const SOLANA_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com'

export enum LedgerToken {
    ORDER = 0,
    ESORDER = 1,
    USDC = 2,
    PLACEHOLDER = 3,
}

export enum PayloadDataType {
    /* ====== Payloads From vault side ====== */
    ClaimReward = 0,
    Stake = 1,
    CreateOrderUnstakeRequest = 2,
    CancelOrderUnstakeRequest = 3,
    WithdrawOrder = 4,
    EsOrderUnstakeAndVest = 5,
    CancelVestingRequest = 6,
    CancelAllVestingRequests = 7, // Not supported anymore. Do not remove for backward compatibility
    ClaimVestingRequest = 8,
    RedeemValor = 9,
    ClaimUsdcRevenue = 10,
    /* ====== Backward Payloads from ledger side ====== */
    ClaimRewardBackward = 11,
    WithdrawOrderBackward = 12,
    ClaimVestingRequestBackward = 13,
    ClaimUsdcRevenueBackward = 14,
    /* ====== New Payloads ====== */
    UnstakeOrderNow = 15,
    ClaimRewardSolana = 16,
}

export function getEnv(): String {
    let ENV = process.env.ENV
    if (!ENV) {
        throw new Error('Please set ENV variable in the .env file (can be LOCAL, DEV, QA, STAGING, PROD)')
    }

    ENV = ENV.trim().toUpperCase()

    if (!VALID_ENVS.includes(ENV)) {
        throw new Error('Invalid ENV variable. It can be LOCAL, DEV, QA, STAGING, PROD')
    }

    return ENV
}

export function setupAnchor(): [AnchorProvider, Wallet, string] {
    const ENV = getEnv()

    let ANCHOR_PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL
    if (!ANCHOR_PROVIDER_URL) {
        if (ENV === 'LOCAL') {
            process.env.RPC_URL_SOLANA_TESTNET = LOCALHOST_RPC_URL
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA_TESTNET
        } else if (ENV === 'PROD') {
            process.env.RPC_URL_SOLANA = SOLANA_MAINNET_RPC_URL
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA
        } else {
            process.env.RPC_URL_SOLANA_TESTNET = SOLANA_DEVNET_RPC_URL
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA_TESTNET
        }
    }
    const provider = AnchorProvider.env()
    setProvider(provider)
    const rpc = provider.connection.rpcEndpoint
    console.log(`Running on ${ENV} environment. Rpc: ${rpc}`)
    const wallet = provider.wallet as Wallet
    return [provider, wallet, rpc]
}

export function getSolanaEid(): number {
    if (getEnv() === 'PROD') {
        return EndpointId.SOLANA_V2_MAINNET
    }
    return EndpointId.SOLANA_V2_TESTNET
}

export function isTestnet(): boolean {
    return getEnv() !== 'PROD'
}

export function getOrderlyEid(): number {
    if (getEnv() === 'PROD') {
        return EndpointId.ORDERLY_V2_MAINNET
    }
    return EndpointId.ORDERLY_V2_TESTNET
}

export function getConfigPath() {
    const ENV = getEnv()
    return join(__dirname, `../../config/${ENV.toLowerCase()}.json`)
}

let configSingleton: any = null

export function getConfig(): any {
    if (configSingleton) {
        return configSingleton
    }

    const configPath = getConfigPath()
    try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        return config
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to load config file at ${configPath}: ${error.message}`)
        } else {
            throw new Error(`Failed to load config file at ${configPath}: Unknown error`)
        }
    }
}

export function updateConfig(config: any) {
    console.log('Updated config:', config)
    const configPath = getConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(`Config saved to ${configPath}\n`)
    configSingleton = null
}

export function getDeployedProxyProgram(provider: AnchorProvider): Program<SolanaProxy> {
    const proxyProgramIdStr = getConfig().proxyProgramId
    return new Program<SolanaProxy>(IDL, proxyProgramIdStr, provider)
}

export function getDeployedOftProgram(provider: AnchorProvider): Program<Oft> {
    const oftProgramIdStr = getConfig().oftProgramId
    return new Program<Oft>(oftIDL, oftProgramIdStr, provider)
}

export function amountStrToBytes32(str: string): number[] {
    const bigNumber = ethers.BigNumber.from(str)
    const bytes32 = ethers.utils.zeroPad(bigNumber.toHexString(), 32)
    return Array.from(bytes32)
}

export function getProxyConfigPda(proxyProgramId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(PROXY_CONFIG_SEED, 'utf8')], proxyProgramId)[0]
}

export function printTxLinks(txid: string) {
    console.log(`Solana transaction:    ${getExplorerTxLink(txid, isTestnet())}`)
    console.log(`LzyerZero transaction: ${getLayerZeroScanLink(txid, isTestnet())}`)
}

export function printProxyConfig(title: string, proxyConfig: any) {
    console.log(`${title}: {`)
    console.log('  bump:             ', proxyConfig.bump.toString())
    console.log('  owner:            ', proxyConfig.owner.toBase58())
    console.log('  nonce:            ', proxyConfig.nonce.toString())
    console.log('  dstEid:           ', proxyConfig.dstEid.toString())
    console.log('  solChainId:       ', proxyConfig.solChainId.toString())
    console.log('  oftProgram:       ', proxyConfig.oftProgram.toBase58())
    console.log('  occManagerAddress:', bytes32ToEthAddress(new Uint8Array(proxyConfig.occManagerAddress)))
    console.log('}')
}

export async function initProxy(
    provider: AnchorProvider,
    proxyProgram: Program<SolanaProxy>,
    oftProgramId: PublicKey,
    mintPda: PublicKey,
    occManagerAddress: string,
    nonce: number = 0
) {
    if (!isAddress(occManagerAddress)) {
        throw new Error('Invalid OCC manager address')
    }

    const wallet = provider.wallet as Wallet
    const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
    const proxyEscrowAta = getAssociatedTokenAddressSync(mintPda, proxyConfigPda, true)

    console.log('Init Proxy Config PDA...')
    console.log('Proxy program ID:', proxyProgram.programId.toBase58())
    console.log('OFT Program ID:', oftProgramId.toBase58())
    console.log('Mint PDA:', mintPda.toBase58())
    console.log('OCC Manager Address:', occManagerAddress)
    console.log('Proxy Config PDA:', proxyConfigPda.toBase58())
    console.log('Proxy Escrow ATA:', proxyEscrowAta.toBase58())

    const initProxyParams = {
        owner: wallet.publicKey,
        nonce: new BN(nonce),
        dstEid: getOrderlyEid(),
        solChainId: new BN(getSolanaEid()),
        oftProgram: oftProgramId,
        occManagerAddress: Array.from(addressToBytes32(occManagerAddress)),
    }

    const initProxyAccounts = {
        admin: wallet.publicKey,
        proxyConfig: proxyConfigPda,
        proxyEscrow: proxyEscrowAta,
        tokenMint: mintPda,
    }

    const ixInitProxy = await proxyProgram.methods.initProxy(initProxyParams).accounts(initProxyAccounts).instruction()

    await createAndSendV0Tx([ixInitProxy], provider, wallet)
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
    console.log('   ✅ - Transaction sent to network', txid)

    // await new Promise((r) => setTimeout(r, 2000))
    return txid
}

export async function getLookupTableAccount(provider: AnchorProvider, lookupTableAddress: string) {
    const lookupTableAccount = (await provider.connection.getAddressLookupTable(new PublicKey(lookupTableAddress)))
        .value
    if (!lookupTableAccount) {
        throw new Error(`Lookup table account ${lookupTableAddress} does not exist. Please create it first.`)
    }
    return lookupTableAccount
}

export async function createAndSendV0TxWithTable(
    txInstructions: TransactionInstruction[],
    provider: AnchorProvider,
    payerPubKey: PublicKey,
    signers: Signer[]
) {
    const lookupTableAccount = await getLookupTableAccount(provider, getConfig().proxyLookupTable)
    const msg = new TransactionMessage({
        payerKey: payerPubKey,
        recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
        instructions: txInstructions,
    }).compileToV0Message([lookupTableAccount])
    const tx = new VersionedTransaction(msg)
    tx.sign(signers)
    return await provider.connection.sendTransaction(tx)
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

export const ENDPOINT_PROGRAM_ID = new PublicKey('76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6')
const EVENT_SEED = '__event_authority'
export function getEventAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(EVENT_SEED, 'utf8')], new PublicKey(getConfig().unknownPda))[0]
}

function accountMeta(pubkey: string | PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
    return { pubkey: (pubkey = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey), isSigner, isWritable }
}

export async function printQuoteSendRemainAccounts(provider: AnchorProvider) {
    const wallet = provider.wallet as Wallet
    const config = getConfig()
    const dstEid = getOrderlyEid()
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

export function encodeUserRequestPayload(amount: string): Uint8Array {
    const amountArray = amountStrToBytes32(amount)
    const encodedStr = defaultAbiCoder.encode(['tuple(uint256)'], [[amountArray]])
    // console.log('Encoded user request payload:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    return encodedBytes
}

export function encodeOCCVaultMessage(
    chainedEventId: BN,
    srcChainId: number,
    token: number,
    tokenAmount: string,
    sender: PublicKey,
    payloadType: number,
    payload: Uint8Array
): Uint8Array {
    const encodedStr = defaultAbiCoder.encode(
        ['tuple(uint256,uint256,uint8,uint256,bytes32,uint8,bytes)'],
        [[chainedEventId.toNumber(), srcChainId, token, amountStrToBytes32(tokenAmount), sender.toBytes(), payloadType, payload]]
    )
    // console.log('Encoded OCC vault message:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    // console.log('Encoded OCC vault message bytes:', encodedBytes)
    // console.log('Encoded OCC vault message length:', encodedBytes.length)
    return encodedBytes
}

export function createComposeMsgForUserRequest(
    payloadDataType: PayloadDataType,
    amount: string,
    chainedEventId: BN,
    sender: PublicKey
): Uint8Array {
    let payload: Uint8Array
    let token = LedgerToken.PLACEHOLDER
    if (payloadDataType === PayloadDataType.Stake) {
        payload = Buffer.from('')
        token = LedgerToken.ORDER
    } else {
        payload = encodeUserRequestPayload(amount)
        amount = '0'
    }
    return encodeOCCVaultMessage(chainedEventId, getSolanaEid(), token, amount, sender, payloadDataType, payload)
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

export function getPayloadDataType(payloadType: number | string): PayloadDataType {
    if (!isNaN(Number(payloadType))) {
        payloadType = Number(payloadType)
    }

    if (typeof payloadType === 'string') {
        payloadType = payloadType.toLowerCase()
    }

    switch (payloadType) {
        case 1:
        case 'stake':
            return PayloadDataType.Stake
        case 2:
        case 'createorderunstakerequest':
            return PayloadDataType.CreateOrderUnstakeRequest
        case 3:
        case 'cancelorderunstakerequest':
            return PayloadDataType.CancelOrderUnstakeRequest
        case 4:
        case 'withdraworder':
            return PayloadDataType.WithdrawOrder
        case 5:
        case 'esorderunstakeandvest':
            return PayloadDataType.EsOrderUnstakeAndVest
        case 6:
        case 'cancelvestingrequest':
            return PayloadDataType.CancelVestingRequest
        case 8:
        case 'claimvestingrequest':
            return PayloadDataType.ClaimVestingRequest
        case 9:
        case 'redeemvalor':
            return PayloadDataType.RedeemValor
        case 10:
        case 'claimusdcrevenue':
            return PayloadDataType.ClaimUsdcRevenue
        case 15:
        case 'unstakeordernow':
            return PayloadDataType.UnstakeOrderNow
        default:
            throw new Error(`Unsupported payload type: ${payloadType}`)
    }
}

export async function getRequestOpts(provider: AnchorProvider, payloadDataType: PayloadDataType, wallet: Wallet) {
    const proxyProgram = getDeployedProxyProgram(provider)
    const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)

    const ixGetRequestOpts = await proxyProgram.methods
        .getRequestOpts({
            requestType: payloadDataType,
        })
        .accounts({
            user: wallet.publicKey,
            proxyConfig: proxyConfigPda,
        })
        .instruction()
    const txSig = await createAndSendV0Tx([ixGetRequestOpts], provider, wallet)
    const tx = await getTransactionWithRetries(txSig, provider)
    const { key, buffer } = getReturnLog(tx)
    assert(key === proxyProgram.programId.toString(), 'Invalid program ID')

    class Assignable {
        [key: string]: any
        constructor(properties: { [x: string]: any }) {
            Object.keys(properties).map((key) => {
                this[key] = properties[key]
            })
        }
    }

    class RequestOpts extends Assignable {
        nonce!: BN

        static schema: borsh.Schema = new Map([[RequestOpts, { kind: 'struct', fields: [['nonce', 'u64']] }]])

        print() {
            console.log(`Nonce: ${this.nonce}`)
        }
    }

    const requestOpts = borsh.deserialize(RequestOpts.schema, RequestOpts, buffer)
    requestOpts.print()
    return requestOpts
}
