import * as anchor from '@coral-xyz/anchor'
import { BN, Program, Idl } from '@coral-xyz/anchor'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
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
import { fromWeb3JsPublicKey, toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters'
import { createNoopSigner } from '@metaplex-foundation/umi'
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
    const rpc = utils.getUmi(ENV).rpc
    console.log('RPC:', rpc)
    const usdcMintAuthority = Keypair.generate()

    const proxyConfigPda = pdaHelper.getProxyConfigPda(proxyProgram.programId)
    const orderlyEid = utils.getOrderlyEid(ENV)
    const solChainId = utils.getSolanaChainId(ENV)
    const solEid = utils.getSolanaEid(ENV)
    const oappRegistryPda = pdaHelper.getOAppRegistryPda(proxyConfigPda)
    // console.log('OAPP Registry PDA:', oappRegistryPda.toBase58())
    const admin = wallet
    const peerAddress = utils.getPeerAddress(ENV)

    const endpointPda = pdaHelper.getEndpointSettingPda(endpointProgram.programId)
    // console.log('Endpoint PDA:', endpointPda.toBase58())
    const messageLibPda = pdaHelper.getMessageLibPda(ulnProgram.programId)
    // console.log('Message Lib PDA:', messageLibPda.toBase58())
    const messageLibInfoPda = pdaHelper.getMessageLibInfoPda(messageLibPda)
    // console.log('Message Lib Info PDA:', messageLibInfoPda.toBase58())

    const ulnPda = pdaHelper.getUlnSettingPda()
    console.log('ULN PDA:', ulnPda.toBase58())

    const defaultSendLibraryConfigPda = pdaHelper.getDefaultSendLibConfigPda(orderlyEid)
    const defaultReceiveLibraryConfigPda = pdaHelper.getDefaultReceiveLibConfigPda(orderlyEid)

    const sendLibraryConfigPda = pdaHelper.getSendLibConfigPda(proxyConfigPda, orderlyEid)
    const receiveLibraryConfigPda = pdaHelper.getReceiveLibConfigPda(proxyConfigPda, orderlyEid)

    const sendConfigPda = pdaHelper.getSendConfigPda(proxyConfigPda, orderlyEid)
    const receiveConfigPda = pdaHelper.getReceiveConfigPda(proxyConfigPda, orderlyEid)

    const noncePda = pdaHelper.getNoncePda(proxyConfigPda, orderlyEid, peerAddress)
    const pendingInboundNoncePda = pdaHelper.getPendingInboundNoncePda(proxyConfigPda, orderlyEid, peerAddress)

    // const endpointSettingPda = pdaHelper.getEndpointSettingPda(endpointProgram.programId)
    // console.log('Endpoint Setting PDA:', endpointSettingPda.toBase58())

    const lzReceiveTypesPda = pdaHelper.getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)

    const peerConfigPda = pdaHelper.getPeerConfigPda(proxyProgram.programId, orderlyEid, proxyConfigPda)
    console.log('Peer Config PDA:', peerConfigPda.toBase58())

    const USDC_KEYPAIR = Keypair.generate()
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

        // Initialize Endpoint
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

        // Register Library for ULN program
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

        // Initialize Default Send Library
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

        // Initialize Default Receive Library
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

        // Initialize ULN program
        await ulnProgram.methods
            .initUln({
                eid: solEid,
                endpoint: messageLibInfoPda, // the pda signer of the endpoint program
                endpointProgram: endpointProgram.programId,
                admin: admin.publicKey,
            })
            .accounts({
                payer: wallet.publicKey,
                uln: messageLibPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc(confirmOptions)

        // Initialize Send and Receive Config for ULN
        // const config = utils.getLzConfig(orderlyEid)

        // const sendUlnConfig = {
        //     confirmations: new BN(config.sendLibConfig.ulnConfig.confirmations),
        //     requiredDvnCount: Number(config.sendLibConfig.ulnConfig.requiredDVNCount),
        //     optionalDvnCount: Number(config.sendLibConfig.ulnConfig.optionalDVNCount),
        //     optionalDvnThreshold: Number(config.sendLibConfig.ulnConfig.optionalDVNThreshold),
        //     requiredDvns: config.sendLibConfig.ulnConfig.requiredDVNs.map((address) => new PublicKey(address)),
        //     optionalDvns: [],
        // }
        // const receiveUlnConfig = {
        //     confirmations: new BN(config.receiveLibConfig?.ulnConfig.confirmations),
        //     requiredDvnCount: Number(config.receiveLibConfig?.ulnConfig.requiredDVNCount),
        //     optionalDvnCount: Number(config.receiveLibConfig?.ulnConfig.optionalDVNCount),
        //     optionalDvnThreshold: Number(config.receiveLibConfig?.ulnConfig.optionalDVNThreshold),
        //     requiredDvns: config.receiveLibConfig?.ulnConfig.requiredDVNs.map((address) => new PublicKey(address)),
        //     optionalDvns: [],
        // }
        // const executorConfig = {
        //     maxMessageSize: Number(config.sendLibConfig.executorConfig.maxMessageSize),
        //     executor: new PublicKey(config.sendLibConfig.executorConfig.executorAddress),
        // }
        // const ulnSendConfigPda = pdaHelper.getUlnSendConfigPda(orderlyEid)
        // const ulnReceiveConfigPda = pdaHelper.getUlnReceiveConfigPda(orderlyEid)

        // await ulnProgram.methods
        //     .initDefaultConfig({
        //         eid: orderlyEid,
        //         sendUlnConfig: sendUlnConfig,
        //         receiveUlnConfig: receiveUlnConfig,
        //         executorConfig: executorConfig,
        //     })
        //     .accounts({
        //         admin: admin.publicKey,
        //         uln: ulnPda,
        //         sendConfig: ulnSendConfigPda,
        //         receiveConfig: ulnReceiveConfigPda,
        //         systemProgram: SystemProgram.programId,
        //     })
        //     .rpc(confirmOptions)
    })

    it('Initialize Solana Proxy', async () => {
        const initRemainingAccounts = utils.getInitOAppRemainingAccounts(wallet, proxyConfigPda)

        await proxyProgram.methods
            .initProxy({
                endpointProgram: endpointProgram.programId,
                usdcTokenAccount: USDC_MINT,
                admin: admin.publicKey,
                orderlyEid: orderlyEid,
                solChainId: solChainId,
            })
            .accounts({
                payer: wallet.publicKey,
                proxyConfig: proxyConfigPda,
                lzReceiveTypesAccounts: lzReceiveTypesPda,
                proxyTokenAccount: proxyTokenAccount,
                tokenMint: USDC_MINT,
            })
            .remainingAccounts(initRemainingAccounts)
            .rpc(confirmOptions)

        const proxyConfig = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)

        assert.equal(proxyConfig.endpointProgram.toBase58(), endpointProgram.programId.toBase58())
        assert.equal(proxyConfig.usdcTokenAccount.toBase58(), USDC_MINT.toBase58())
        assert.equal(proxyConfig.admin.toBase58(), admin.publicKey.toBase58())
        assert.equal(proxyConfig.orderlyEid, orderlyEid)
        assert.equal(proxyConfig.solChainId, solChainId)
        assert.equal(proxyConfig.paused, false)

        // Initialize Nonce for Solana Proxy
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

        // Initialize Send Library for Solana Proxy
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

        // Initialize Receive Library for Solana Proxy
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

        // Set Send Library for Solana Proxy
        await endpointProgram.methods
            .setSendLibrary({
                sender: proxyConfigPda,
                eid: orderlyEid,
                newLib: messageLibPda,
            })
            .accounts({
                signer: admin.publicKey,
                oappRegistry: oappRegistryPda,
                sendLibraryConfig: sendLibraryConfigPda,
                messageLibInfo: messageLibInfoPda,
            })
            .rpc(confirmOptions)

        await endpointProgram.methods
            .setReceiveLibrary({
                receiver: proxyConfigPda,
                eid: orderlyEid,
                newLib: messageLibPda,
                gracePeriod: new BN(0),
            })
            .accounts({
                signer: admin.publicKey,
                oappRegistry: oappRegistryPda,
                receiveLibraryConfig: receiveLibraryConfigPda,
                messageLibInfo: messageLibInfoPda,
            })
            .rpc(confirmOptions)
    })

    it('Set Peer Config', async () => {
        const admin = createNoopSigner(fromWeb3JsPublicKey(wallet.publicKey))
        const oftStore = fromWeb3JsPublicKey(proxyConfigPda)
        const options = utils.getOptions(ENV)
        const [optionSend, optionSendAndCall] = utils.getEncodedOptions(options)
        const programId = fromWeb3JsPublicKey(proxyProgram.programId)

        const wrappedIx = [
            oft.setPeerConfig(
                {
                    oftStore: oftStore,
                    admin: admin,
                },
                {
                    __kind: 'PeerAddress',
                    peer: Buffer.from(peerAddress!),
                    remote: orderlyEid,
                },
                programId
            ),
            oft.setPeerConfig(
                { oftStore: oftStore, admin: admin },
                {
                    __kind: 'EnforcedOptions',
                    send: optionSend,
                    sendAndCall: optionSendAndCall,
                    remote: orderlyEid,
                },
                programId
            ),
            oft.setPeerConfig(
                {
                    oftStore: oftStore,
                    admin: admin,
                },
                {
                    __kind: 'FeeBps',
                    feeBps: 0,
                    remote: orderlyEid,
                },
                programId
            ),
        ]

        const ix = utils.intoIx(wrappedIx)
        const tx = await utils.createAndSendV0Tx(ix, provider, wallet)

        const peerConfig = await proxyProgram.account.peerConfig.fetch(peerConfigPda)
        assert.equal(peerConfig.peerAddress.toString(), peerAddress.toString())

        assert.equal(
            Buffer.from(peerConfig.enforcedOptions.send).toString('hex'),
            Buffer.from(optionSend).toString('hex')
        )
        assert.equal(
            Buffer.from(peerConfig.enforcedOptions.sendAndCall).toString('hex'),
            Buffer.from(optionSendAndCall).toString('hex')
        )

        assert.equal(peerConfig.feeBps, 0)
    })

    // it('Set OAPP Config', async () => {
    //     const admin = createNoopSigner(fromWeb3JsPublicKey(wallet.publicKey))
    //     const oftStore = fromWeb3JsPublicKey(proxyConfigPda)

    //     const ulnData = await ulnProgram.account.ulnSettings.fetch(ulnPda)
    //     console.log('ULN PDA:', ulnPda.toBase58())
    //     console.log('ULN Data:', ulnData)

    //     const initIx = [
    //         oft.initConfig(
    //             {
    //                 admin: admin,
    //                 oftStore: oftStore,
    //                 payer: admin,
    //             },
    //             orderlyEid
    //         ),
    //     ]
    //     const ixInitConfig = utils.intoIx(initIx)
    //     const txInitConfig = await utils.createAndSendV0Tx(ixInitConfig, provider, wallet)

    //     const endpointData = await endpointProgram.account.endpointSettings.fetch(endpointPda)
    //     console.log('Endpoint Data:', endpointData)

    //     const config = utils.getLzConfig(orderlyEid)
    //     const ixSetConfig = [
    //         await oft.setConfig(
    //             provider.connection,
    //             {
    //                 signer: admin.publicKey,
    //                 oftStore: oftStore,
    //             },
    //             {
    //                 remoteEid: orderlyEid,
    //                 configType: 1, // EXECUTOR
    //                 config: {
    //                     maxMessageSize: config.sendLibConfig.executorConfig.maxMessageSize,
    //                     executor: new PublicKey(config.sendLibConfig.executorConfig.executorAddress),
    //                 },
    //             }
    //         ),
    //         await oft.setConfig(
    //             provider.connection,
    //             {
    //                 signer: admin.publicKey,
    //                 oftStore: oftStore,
    //             },
    //             {
    //                 remoteEid: orderlyEid,
    //                 configType: 2, // SEND ULN
    //                 config: {
    //                     confirmations: config.sendLibConfig.ulnConfig.confirmations,
    //                     requiredDvnCount: config.sendLibConfig.ulnConfig.requiredDVNCount,
    //                     optionalDvnCount: config.sendLibConfig.ulnConfig.optionalDVNCount,
    //                     optionalDvnThreshold: config.sendLibConfig.ulnConfig.optionalDVNThreshold,
    //                     requiredDvns: config.sendLibConfig.ulnConfig.requiredDVNs.map(
    //                         (address) => new PublicKey(address)
    //                     ), // [new Web3PublicKey(config.sendLibConfig?.ulnConfig.requiredDVNs[0]!)]
    //                     optionalDvns: [],
    //                 },
    //             }
    //         ),

    //         await oft.setConfig(
    //             provider.connection,
    //             {
    //                 signer: admin.publicKey,
    //                 oftStore: oftStore,
    //             },
    //             {
    //                 remoteEid: orderlyEid,
    //                 configType: 3, // RECEIVE ULN
    //                 config: {
    //                     confirmations: config.receiveLibConfig?.ulnConfig.confirmations,
    //                     requiredDvnCount: config.receiveLibConfig?.ulnConfig.requiredDVNCount,
    //                     optionalDvnCount: config.receiveLibConfig?.ulnConfig.optionalDVNCount,
    //                     optionalDvnThreshold: config.receiveLibConfig?.ulnConfig.optionalDVNThreshold,
    //                     requiredDvns: config.receiveLibConfig?.ulnConfig.requiredDVNs.map(
    //                         (address) => new PublicKey(address)
    //                     ), // [new Web3PublicKey(config.sendLibConfig?.ulnConfig.requiredDVNs[0]!)]
    //                     optionalDvns: [],
    //                 },
    //             }
    //         ),
    //     ]
    // })

    const quoteFee = async (params: any) => {
        const accounts = {
            user: wallet.publicKey,
            peerConfig: peerConfigPda,
            proxyConfig: proxyConfigPda,
            backwardFee: backwardFeePda,
        }
        const quoteRemainingAccounts = [
            {
                pubkey: endpointProgram.programId,
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: ulnProgram.programId, // send_library_program
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: sendLibraryConfigPda, // send_library_config
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: defaultSendLibraryConfigPda, // default_send_library_config
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: messageLibInfoPda, // send_library_info
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: endpointPda, // endpoint settings
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: noncePda, // nonce
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: eventAuthorityPda,
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: endpointProgram.programId,
                isWritable: false,
                isSigner: false,
            },
        ]

        const web3Ix = ixSetConfig.map((ix) => toWeb3JsInstruction(ix))
        const txSetConfig = await utils.createAndSendV0Tx(web3Ix, provider, wallet)

        const sendConfig = await ulnProgram.account.sendConfig.fetch(sendConfigPda)
        assert.equal(sendConfig.uln.confirmations.toString(), config.sendLibConfig.ulnConfig.confirmations.toString())
        assert.equal(sendConfig.uln.requiredDvnCount, Number(config.sendLibConfig.ulnConfig.requiredDVNCount))
        assert.equal(sendConfig.uln.optionalDvnCount, Number(config.sendLibConfig.ulnConfig.optionalDVNCount))
        assert.equal(sendConfig.uln.optionalDvnThreshold, Number(config.sendLibConfig.ulnConfig.optionalDVNThreshold))
        assert.equal(sendConfig.uln.requiredDvns.length, config.sendLibConfig.ulnConfig.requiredDVNs.length)
        for (let i = 0; i < sendConfig.uln.requiredDvns.length; i++) {
            assert.equal(sendConfig.uln.requiredDvns[i].toBase58(), config.sendLibConfig.ulnConfig.requiredDVNs[i])
            assert.equal(sendConfig.uln.optionalDvns.length, 0)
        }
        const receiveConfig = await ulnProgram.account.receiveConfig.fetch(receiveConfigPda)
        assert.equal(
            receiveConfig.uln.confirmations.toString(),
            config.receiveLibConfig?.ulnConfig.confirmations.toString()
        )
        assert.equal(receiveConfig.uln.requiredDvnCount, Number(config.receiveLibConfig?.ulnConfig.requiredDVNCount))
        assert.equal(receiveConfig.uln.optionalDvnCount, Number(config.receiveLibConfig?.ulnConfig.optionalDVNCount))
        assert.equal(
            receiveConfig.uln.optionalDvnThreshold,
            Number(config.receiveLibConfig?.ulnConfig.optionalDVNThreshold)
        )
        assert.equal(receiveConfig.uln.requiredDvns.length, config.receiveLibConfig?.ulnConfig.requiredDVNs.length)
        for (let i = 0; i < receiveConfig.uln.requiredDvns.length; i++) {
            assert.equal(
                receiveConfig.uln.requiredDvns[i].toBase58(),
                config.receiveLibConfig?.ulnConfig.requiredDVNs[i]
            )
            assert.equal(receiveConfig.uln.optionalDvns.length, 0)
        }
    })

    it('Set Backward Fee', async () => {
        const backwardFeePda = pdaHelper.getBackwardFeePda(proxyProgram.programId)
        const { orderBackwardFee, usdcBackwardFee } = utils.getBackwardFee()
        const ixSetBackwardFee = await proxyProgram.methods
            .setBackwardFee({
                orderBackwardFee: orderBackwardFee,
                usdcBackwardFee: usdcBackwardFee,
            })
            .accounts({ admin: wallet.publicKey, proxyConfig: proxyConfigPda, backwardFee: backwardFeePda })
            .instruction()
        const tx = await utils.createAndSendV0Tx([ixSetBackwardFee], provider, wallet)

        const backwardFee = await proxyProgram.account.backwardFee.fetch(backwardFeePda)
        assert.equal(backwardFee.orderBackwardFee.toString(), orderBackwardFee.toString())
        assert.equal(backwardFee.usdcBackwardFee.toString(), usdcBackwardFee.toString())
    })
})
