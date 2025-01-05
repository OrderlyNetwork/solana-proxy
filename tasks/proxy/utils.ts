import {
    TransactionInstruction,
    VersionedTransaction,
    TransactionMessage,
    PublicKey,
    AccountMeta,
    SystemProgram,
    Signer,
} from '@solana/web3.js'
import { AnchorProvider, BN, Program, setProvider, Wallet } from '@coral-xyz/anchor'
import { ethers } from 'ethers'
import { IDL, SolanaProxy } from '../../target/types/solana_proxy'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import {
    getAccount,
    getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { OftPDA, accounts, oft, instructions } from '@layerzerolabs/oft-v2-solana-sdk'
import { EventPDADeriver, SendHelper } from '@layerzerolabs/lz-solana-sdk-v2'
import {
    publicKey as metaplexPublicKey,
    createNoopSigner,
    AccountMeta as MetaplexAccountMeta,
} from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { addressToBytes32, bytes32ToEthAddress } from '@layerzerolabs/lz-v2-utilities'
import { hexlify, arrayify } from '@layerzerolabs/lz-utilities'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sleep } from '@layerzerolabs/io-devtools'
import { isAddress } from 'web3-validator'
import fs from 'fs'
import { Sign } from 'crypto'
import { defaultAbiCoder } from '@ethersproject/abi'
import { hexToBytes, bytesToHex } from 'ethereum-cryptography/utils'

const PROXY_CONFIG_SEED = 'ProxyConfig'
const VALID_ENVS = ['LOCAL', 'DEV', 'QA', 'STAGING', 'PROD']
const LOCALHOST_RPC_URL = 'http://localhost:8899'
const SOLANA_DEVNET_RPC_URL = 'https://api.devnet.solana.com'
const SOLANA_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com'

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

export function getConfig(): any {
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
}

export function getDeployedProxyProgram(provider: AnchorProvider): Program<SolanaProxy> {
    const proxyProgramIdStr = getConfig().proxyProgramId
    return new Program<SolanaProxy>(IDL, proxyProgramIdStr, provider)
}

export function amountStrToBytes32(str: string): number[] {
    const bigNumber = ethers.BigNumber.from(str)
    const bytes32 = ethers.utils.zeroPad(bigNumber.toHexString(), 32)
    return Array.from(bytes32)
}

export function getProxyConfigPda(proxyProgramId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(PROXY_CONFIG_SEED, 'utf8')], proxyProgramId)[0]
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

    await new Promise((r) => setTimeout(r, 2000))
}

export async function getLookupTableAccount(provider: AnchorProvider, lookupTableAddress: PublicKey) {
    const lookupTableAccount = (await provider.connection.getAddressLookupTable(lookupTableAddress)).value

    return lookupTableAccount
}

export async function createAndSendV0TxWithTable(
    txInstructions: TransactionInstruction[],
    provider: AnchorProvider,
    payerPubKey: PublicKey,
    signers: Signer[]
) {
    const lookupTableAddressStr = getConfig().proxyLookupTable
    console.log('Lookup Table Address:', lookupTableAddressStr)
    const lookupTableAccount = (await provider.connection.getAddressLookupTable(new PublicKey(lookupTableAddressStr)))
        .value
    if (!lookupTableAccount) {
        throw new Error('Lookup table account does not exist. Please create it first.')
    }
    console.log('1')
    const msg = new TransactionMessage({
        payerKey: payerPubKey,
        recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
        instructions: txInstructions,
    }).compileToV0Message([lookupTableAccount])
    console.log('2')
    const tx = new VersionedTransaction(msg)
    console.log('3')
    tx.sign(signers)
    console.log('4')
    const sigSend = await provider.connection.sendTransaction(tx)
    console.log('5')
    console.log('Send transaction confirmed:', sigSend)
    await sleep(2)
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

export async function getOftQuoteSendAccounts(
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

export function getOftSendRemainingAccounts(): AccountMeta[] {
    const config = getConfig()
    const remainingAccounts = [
        // ----------- Oft send addresses -----------
        accountMeta(config.oftProgramId, false, false),
        accountMeta(config.proxyConfigPda, false, false),
        accountMeta(config.peerPda, false, true),
        accountMeta(config.oftStorePda, false, true),
        accountMeta(config.proxyEscrowAta, false, true),
        accountMeta(config.oftEscrowAta, false, true),
        accountMeta(config.mintPda, false, true),
        accountMeta(TOKEN_PROGRAM_ID, false, false),
        accountMeta(config.unknownPda, false, false),
        accountMeta(config.oftProgramId, false, false),
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
        accountMeta(config.proxyConfigPda, false, false),
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

    return remainingAccounts
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
    console.log('Encoded claim reward payload:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    return encodedBytes
}

export function encodeOCCVaultMessage(
    chainedEventId: number,
    srcChainId: number,
    token: number,
    tokenAmount: string,
    sender: PublicKey,
    payloadType: number,
    payload: Uint8Array
): Uint8Array {
    const encodedStr = defaultAbiCoder.encode(
        ['tuple(uint256,uint256,uint8,uint256,bytes32,uint8,bytes)'],
        [[chainedEventId, srcChainId, token, amountStrToBytes32(tokenAmount), sender.toBytes(), payloadType, payload]]
    )
    console.log('Encoded OCC vault message:', encodedStr)
    const encodedBytes = arrayify(encodedStr)
    console.log('Encoded OCC vault message bytes:', encodedBytes)
    console.log('Encoded OCC vault message length:', encodedBytes.length)
    return encodedBytes
}
