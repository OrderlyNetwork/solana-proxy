import {
    TransactionInstruction,
    VersionedTransaction,
    TransactionMessage,
    PublicKey,
    AccountMeta,
    SystemProgram,
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
import { hexlify } from '@layerzerolabs/lz-utilities'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sleep } from '@layerzerolabs/io-devtools'
import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox'
import { Bytes32 } from '@layerzerolabs/devtools'
import { associated } from '@coral-xyz/anchor/dist/cjs/utils/pubkey'
import { isAddress } from 'web3-validator'

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
    wallet: Wallet
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
        payerKey: wallet.payer.publicKey,
        recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
        instructions: txInstructions,
    }).compileToV0Message([lookupTableAccount])
    console.log('2')
    const tx = new VersionedTransaction(msg)
    console.log('3')
    const signedTx = await wallet.signTransaction(tx)
    // tx.sign([wallet.payer]);
    console.log('4')
    const sigSend = await provider.connection.sendTransaction(signedTx)
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

export async function getOftQuoteSendAccounts(
    provider: AnchorProvider,
    oftProgramIdStr: string,
    oftEscrowPdaStr: string,
    signerPubKey: PublicKey,
    dstEid: number
): Promise<MetaplexAccountMeta[]> {
    const umi = createUmi(provider.connection)

    const oftProgramId = metaplexPublicKey(oftProgramIdStr)
    const deriver = new OftPDA(oftProgramId)

    const tokenEscrow = metaplexPublicKey(oftEscrowPdaStr)
    const tokenEscrowInfo = await getAccount(provider.connection, new PublicKey(tokenEscrow))
    const tokenMint = fromWeb3JsPublicKey(tokenEscrowInfo.mint)

    const [oftStore] = deriver.oftStore(tokenEscrow)
    const [peer] = deriver.peer(oftStore, dstEid)
    const peerInfo = await accounts.fetchPeerConfig(umi, peer)

    const helper = new SendHelper()

    const txBuilder = instructions.quoteSend(
        { programs: oft.createOFTProgramRepo(oftProgramId) },
        {
            peer: peer,
            oftStore: oftStore,
            tokenMint: tokenMint,

            // The following parameters can be any value and will not affect obtaining the accounts.
            dstEid: dstEid,
            to: addressToBytes32('0xDead'),
            amountLd: 1n,
            minAmountLd: 1n,
            options: new Uint8Array(),
            composeMsg: null,
            payInLzToken: false,
        }
    )

    // Get remaining accounts from msgLib(simple_msgLib or uln)
    const ix = txBuilder.addRemainingAccounts(
        (
            await helper.getQuoteAccounts(
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
    oftEscrowPdaStr: string,
    signerPubKey: PublicKey,
    dstEid: number
): Promise<MetaplexAccountMeta[]> {
    const umi = createUmi(provider.connection)

    const oftProgramId = metaplexPublicKey(oftProgramIdStr)
    const deriver = new OftPDA(oftProgramId)

    const tokenEscrow = metaplexPublicKey(oftEscrowPdaStr)
    const tokenEscrowInfo = await getAccount(provider.connection, toWeb3JsPublicKey(tokenEscrow))
    const tokenMint = tokenEscrowInfo.mint

    const signerAta = await getAssociatedTokenAddress(tokenMint, signerPubKey, true)

    const [oftStore] = deriver.oftStore(tokenEscrow)
    const [peer] = deriver.peer(oftStore, dstEid)
    const peerInfo = await accounts.fetchPeerConfig(umi, peer)

    const [eventAuthorityPDA] = new EventPDADeriver(new PublicKey(oftProgramIdStr)).eventAuthority()
    const tokenProgram = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)
    const helper = new SendHelper()

    const txBuilder = instructions.send(
        { programs: oft.createOFTProgramRepo(oftProgramId) },
        {
            signer: createNoopSigner(fromWeb3JsPublicKey(signerPubKey)),
            peer: peer,
            oftStore: oftStore,
            tokenSource: fromWeb3JsPublicKey(signerAta),
            tokenEscrow: tokenEscrow,
            tokenMint: fromWeb3JsPublicKey(tokenMint),
            tokenProgram: tokenProgram,
            eventAuthority: fromWeb3JsPublicKey(eventAuthorityPDA),
            program: oftProgramId,

            // The following parameters can be any value and will not affect obtaining the accounts.
            dstEid: dstEid,
            to: addressToBytes32('0xDead'),
            amountLd: 1n,
            minAmountLd: 1n,
            options: new Uint8Array(),
            composeMsg: null,
            nativeFee: 0n,
            lzTokenFee: 0n,
        }
    )

    // Get remaining accounts from msgLib(simple_msgLib or uln)
    const ix = txBuilder.addRemainingAccounts(
        (
            await helper.getSendAccounts(
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

export function getOftSendRemainingAccounts(wallet: Wallet): AccountMeta[] {
    const config = getConfig()
    const remainingAccounts = [
        {
            pubkey: new PublicKey(config.oftProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.proxyConfigPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.peerPda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: new PublicKey(config.oftStorePda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: getAssociatedTokenAddressSync(new PublicKey(config.mintPda), wallet.publicKey),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: new PublicKey(config.oftEscrowPda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: new PublicKey(config.mintPda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.endpointV2ProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.oftStorePda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.sendLibProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.sendLibConfigPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.defaultSendLibConfigPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.sendLibInfoPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.endpointSettingsPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.noncePda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: new PublicKey(config.eventAuthorityPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.endpointV2ProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.ulnsettingsPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.sendConfigPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.defaultSendConfigPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: wallet.publicKey,
            isSigner: true,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.treasuryProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.ulnEventAuthorityPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.sendLibProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.executorProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.executorConfigPda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: new PublicKey(config.priceFeedProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.priceFeedConfigPda),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.dvnProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.dvnConfigPda),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: new PublicKey(config.priceFeedProgramId),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: new PublicKey(config.priceFeedConfigPda),
            isSigner: false,
            isWritable: false,
        },
    ]

    return remainingAccounts
}
