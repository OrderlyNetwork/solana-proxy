import * as anchor from '@coral-xyz/anchor'
import { BN, Program, Idl } from '@coral-xyz/anchor'
import { SolanaProxy } from '../../target/types/solana_proxy'
import { Endpoint } from './types/endpoint'
import {
    TOKEN_PROGRAM_ID,
    getOrCreateAssociatedTokenAccount,
    getAssociatedTokenAddressSync,
    createMint,
    mintTo,
    getAccount,
    Account,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    freezeAccount,
    thawAccount,
    transfer,
    closeAccount,
    setAuthority,
} from '@solana/spl-token'
import { ConfirmOptions, Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { assert } from 'chai'
import endpointIdl from './idl/endpoint.json'
import { Uln } from './types/uln'
import ulnIdl from './idl/uln.json'
import * as utils from '../../tasks/proxy/utils'
import * as pdaHelper from '../../tasks/proxy/pdaHelper'
import { MainnetV2EndpointId } from '@layerzerolabs/lz-definitions'
import * as constants from '../../tasks/proxy/constants'
import { rpc } from '@coral-xyz/anchor/dist/cjs/utils'
const confirmOptions: ConfirmOptions = { maxRetries: 6, commitment: 'confirmed', preflightCommitment: 'confirmed' }

async function getTokenBalance(connection: Connection, tokenAccount: PublicKey): Promise<number> {
    const account = await getAccount(connection, tokenAccount)
    return Number(account.amount)
}

async function mintTokenTo(
    connection: Connection,
    payer: Keypair,
    mintAuthority: Keypair,
    usdcMint: PublicKey,
    destinationWallet: PublicKey,
    amount: number
) {
    try {
        await mintTo(connection, payer, usdcMint, destinationWallet, mintAuthority, amount, [], confirmOptions)
    } catch (error) {
        console.error('Error minting token:', error)
        throw error
    }
}

// delay for seconds to wait for the transaction to be confirmed
async function delay(seconds: number) {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

describe('Test Solana Proxy', () => {
    console.log('Hello')
    const provider = anchor.AnchorProvider.env()
    const wallet = provider.wallet as anchor.Wallet

    anchor.setProvider(provider)

    const proxyProgram = anchor.workspace.SolanaProxy as Program<SolanaProxy>
    const endpointProgram = new Program(
        endpointIdl as Endpoint,
        constants.ENDPOINT_PROGRAM_ID,
        provider
    ) as Program<Endpoint>

    const ulnProgram = new Program(ulnIdl as Uln, constants.ULN_PROGRAM_ID, provider) as Program<Uln>

    const ENV = 'local'
    const delayTime = 2
    const usdcMintAuthority = Keypair.generate()

    const proxyConfigPda = pdaHelper.getProxyConfigPda(proxyProgram.programId)
    const orderlyEid = utils.getOrderlyEid(ENV)
    const solChainId = utils.getSolanaChainId(ENV)
    const solEid = utils.getSolanaEid(ENV)
    const oappRegistryPda = pdaHelper.getOAppRegistryPda(proxyConfigPda)
    const admin = wallet
    const peerAddress = utils.getPeerAddress(ENV)

    const endpointPda = pdaHelper.getEndpointSettingPda(endpointProgram.programId)
    const messageLibPda = pdaHelper.getMessageLibPda(ulnProgram.programId)
    const messageLibInfoPda = pdaHelper.getMessageLibInfoPda(messageLibPda)

    const defaultSendLibraryConfigPda = pdaHelper.getDefaultSendLibConfigPda(orderlyEid)
    const defaultReceiveLibraryConfigPda = pdaHelper.getDefaultReceiveLibConfigPda(orderlyEid)

    const sendLibraryConfigPda = pdaHelper.getSendLibConfigPda(proxyConfigPda, orderlyEid)
    const receiveLibraryConfigPda = pdaHelper.getReceiveLibConfigPda(proxyConfigPda, orderlyEid)

    const noncePda = pdaHelper.getNoncePda(proxyConfigPda, orderlyEid, peerAddress)
    const pendingInboundNoncePda = pdaHelper.getPendingInboundNoncePda(proxyConfigPda, orderlyEid, peerAddress)

    const endpointSettingPda = pdaHelper.getEndpointSettingPda(endpointProgram.programId)

    const lzReceiveTypesPda = pdaHelper.getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)

    const USDC_KEYPAIR = Keypair.generate()
    console.log('USDC_KEYPAIR', USDC_KEYPAIR.publicKey.toBase58())
    let USDC_MINT: PublicKey
    const proxyTokenAccount = utils.getTokenATA(USDC_KEYPAIR.publicKey, proxyConfigPda)
    USDC_KEYPAIR
    beforeAll(async () => {
        USDC_MINT = await createMint(
            provider.connection,
            admin.payer,
            usdcMintAuthority.publicKey,
            usdcMintAuthority.publicKey,
            6, // USDC has 6 decimals
            USDC_KEYPAIR,
            confirmOptions
        )
        console.log('✅ Deploy USDC coin')
        console.log('USDC_MINT', USDC_MINT.toBase58())

        await endpointProgram.methods
            .initEndpoint({
                eid: solEid,
                admin: admin.publicKey,
            })
            .accounts({
                endpoint: endpointPda,
                payer: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)

        await endpointProgram.methods
            .registerLibrary({
                libProgram: ulnProgram.programId,
                libType: { sendAndReceive: {} },
            })
            .accounts({
                admin: admin.publicKey,
                endpoint: endpointPda,
                messageLibInfo: messageLibInfoPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)

        await endpointProgram.methods
            .initDefaultSendLibrary({
                eid: orderlyEid,
                newLib: messageLibPda,
            })
            .accounts({
                admin: admin.publicKey,
                endpoint: endpointPda,
                defaultSendLibraryConfig: defaultSendLibraryConfigPda,
                messageLibInfo: messageLibInfoPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)
        console.log('✅ Init Default Send Library')

        await endpointProgram.methods
            .initDefaultReceiveLibrary({
                eid: orderlyEid,
                newLib: messageLibPda,
            })
            .accounts({
                admin: admin.publicKey,
                endpoint: endpointPda,
                defaultReceiveLibraryConfig: defaultReceiveLibraryConfigPda,
                messageLibInfo: messageLibInfoPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)

        await ulnProgram.methods
            .initUln({
                eid: solEid,
                endpoint: endpointSettingPda,
                endpointProgram: endpointProgram.programId,
                admin: admin.publicKey,
            })
            .accounts({
                payer: wallet.publicKey,
                uln: messageLibPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)
    })

    it('Initialize Solana Proxy', async () => {
        const initProxyParams = {
            endpointProgram: endpointProgram.programId,
            usdcTokenAccount: USDC_MINT,
            admin: admin.publicKey,
            orderlyEid: orderlyEid,
            solChainId: solChainId,
        }
        const initProxyAccounts = {
            payer: wallet.publicKey,
            proxyConfig: proxyConfigPda,
            lzReceiveTypesAccounts: lzReceiveTypesPda,
            proxyTokenAccount: proxyTokenAccount,
            tokenMint: USDC_MINT,
        }
        const initRemainingAccounts = utils.getInitOAppRemainingAccounts(wallet, proxyConfigPda)

        await proxyProgram.methods
            .initProxy(initProxyParams)
            .accounts(initProxyAccounts)
            .remainingAccounts(initRemainingAccounts)
            .rpc(confirmOptions)

        const proxyConfig = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)

        assert.equal(proxyConfig.endpointProgram.toBase58(), endpointProgram.programId.toBase58())
        assert.equal(proxyConfig.usdcTokenAccount.toBase58(), USDC_MINT.toBase58())
        assert.equal(proxyConfig.admin.toBase58(), admin.publicKey.toBase58())
        assert.equal(proxyConfig.orderlyEid, orderlyEid)
        assert.equal(proxyConfig.solChainId, solChainId)
        assert.equal(proxyConfig.paused, false)

        await endpointProgram.methods
            .initNonce({
                localOapp: proxyConfigPda,
                remoteEid: orderlyEid,
                remoteOapp: peerAddress,
            })
            .accounts({
                delegate: admin.publicKey,
                oappRegistry: oappRegistryPda,
                nonce: noncePda,
                pendingInboundNonce: pendingInboundNoncePda,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin.payer])
            .rpc(confirmOptions)

        await endpointProgram.methods
            .initSendLibrary({
                sender: proxyConfigPda,
                eid: orderlyEid,
            })
            .accounts({
                delegate: wallet.publicKey,
                oappRegistry: oappRegistryPda,
                sendLibraryConfig: sendLibraryConfigPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)
        console.log('✅ Init Send Library')

        await endpointProgram.methods
            .initReceiveLibrary({
                receiver: proxyConfigPda,
                eid: orderlyEid,
            })
            .accounts({
                delegate: wallet.publicKey,
                oappRegistry: oappRegistryPda,
                receiveLibraryConfig: receiveLibraryConfigPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)
        console.log('✅ Initialized Receive Library')
    })

    it('Set Peer Config', async () => {
        // const proxyConfigPda = pdaHelper.getProxyConfigPda(proxyProgram.programId)
        // const peerPda = pdaHelper.getPeerPda(proxyProgram.programId, proxyConfigPda, 1)
        // const peerConfig = await proxyProgram.account.peer.fetch(peerPda)
        // console.log('Peer Config:', peerConfig)
    })
})
