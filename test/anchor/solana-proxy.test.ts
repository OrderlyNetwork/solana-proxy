import * as anchor from '@coral-xyz/anchor'
import { BN, Program, Idl } from '@coral-xyz/anchor'
import { accounts, oft } from '@layerzerolabs/oft-v2-solana-sdk'
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
import { createAndSendV0Tx } from '../../tasks/proxy/utils'
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

    const ulnMock = new PublicKey('279tDX6wTFgrJaRnGEdjik3NLR8B9AKY1pKVFYcxvw7c')
    const ulnProgram = new Program(ulnIdl as Uln, ulnMock, provider) as Program<Uln>

    const ENV = 'local'
    const rpc = utils.getUmi(ENV).rpc
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
    // console.log('ULN PDA:', ulnPda.toBase58())

    const defaultSendLibraryConfigPda = pdaHelper.getDefaultSendLibConfigPda(orderlyEid)
    const defaultReceiveLibraryConfigPda = pdaHelper.getDefaultReceiveLibConfigPda(orderlyEid)

    const sendLibraryConfigPda = pdaHelper.getSendLibConfigPda(proxyConfigPda, orderlyEid)
    const receiveLibraryConfigPda = pdaHelper.getReceiveLibConfigPda(proxyConfigPda, orderlyEid)

    const sendConfigPda = pdaHelper.getSendConfigPda(proxyConfigPda, orderlyEid)
    const receiveConfigPda = pdaHelper.getReceiveConfigPda(proxyConfigPda, orderlyEid)

    const noncePda = pdaHelper.getNoncePda(proxyConfigPda, orderlyEid, peerAddress)
    const pendingInboundNoncePda = pdaHelper.getPendingInboundNoncePda(proxyConfigPda, orderlyEid, peerAddress)

    const eventAuthorityPda = pdaHelper.getEventAuthorityPda()

    const accountListPda = pdaHelper.getAccountListPda(proxyProgram.programId, proxyConfigPda)

    const lzReceiveTypesPda = pdaHelper.getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)

    const peerConfigPda = pdaHelper.getPeerConfigPda(proxyProgram.programId, orderlyEid, proxyConfigPda)
    // console.log('Peer Config PDA:', peerConfigPda.toBase58())

    const backwardFeePda = pdaHelper.getBackwardFeePda(proxyProgram.programId)

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

    const sendRemainingAccounts = [
        {
            pubkey: endpointProgram.programId,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: proxyConfigPda, // signer and sender
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: ulnProgram.programId,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: sendLibraryConfigPda,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: defaultSendLibraryConfigPda,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: messageLibInfoPda,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: endpointPda,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: noncePda, // nonce
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: eventAuthorityPda,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: endpointProgram.programId,
            isWritable: true,
            isSigner: false,
        },
    ]

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
                // accountList: accountListPda,
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

        const { lzTokenFee, nativeFee } = await proxyProgram.methods
            .quoteRequest(params)
            .accounts(accounts)
            .remainingAccounts(quoteRemainingAccounts)
            .view()

        return { lzTokenFee, nativeFee }
    }

    it('Set Backward Fee and Quote Fee', async () => {
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

        const fakeNativeFee = new BN(1000)
        const fakeLzTokenFee = new BN(0)

        const payloadType = constants.PayloadType.UnstakeOrderNow
        const payload = utils.checkPayload(payloadType, '1')
        const { params, accounts, connection, path } = utils.prepareParamsAndAccounts(
            proxyProgram,
            wallet.publicKey,
            payloadType,
            Buffer.from(payload),
            ENV
        )

        const { lzTokenFee, nativeFee } = await quoteFee(params)

        assert.equal(nativeFee.toString(), fakeNativeFee.add(orderBackwardFee).toString())
        assert.equal(lzTokenFee.toString(), fakeLzTokenFee.toString())
    })

    const sendRequest = async (params: any, lzTokenFee: BN, nativeFee: BN) => {
        const accounts = {
            user: wallet.publicKey,
            peerConfig: peerConfigPda,
            proxyConfig: proxyConfigPda,
            backwardFee: backwardFeePda,
        }

        const msgFee = {
            lzTokenFee: lzTokenFee,
            nativeFee: nativeFee,
        }
        const requestIx = await proxyProgram.methods
            .sendRequest(params, msgFee)
            .accounts(accounts)
            .remainingAccounts(sendRemainingAccounts)
            .instruction()
        const tx = await utils.createAndSendV0Tx([requestIx], provider, wallet)
    }

    const uint8ArrayToNumber = (arr: Uint8Array) => {
        return (
            (arr[arr.length - 4] << 24) | (arr[arr.length - 3] << 16) | (arr[arr.length - 2] << 8) | arr[arr.length - 1]
        )
    }

    const uint8ArrayToHex = (arr: Uint8Array) => {
        return '0x' + Array.from(arr, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }

    const quoteClaimFee = async () => {
        const claimDataPda = pdaHelper.getClaimDataPda(proxyProgram.programId, wallet.publicKey)
        const accounts = {
            user: wallet.publicKey,
            peerConfig: peerConfigPda,
            proxyConfig: proxyConfigPda,
            backwardFee: backwardFeePda,
            claimData: claimDataPda,
        }

        const { lzTokenFee, nativeFee } = await proxyProgram.methods
            .quoteClaim()
            .accounts(accounts)
            .remainingAccounts(quoteRemainingAccounts)
            .view()
        return { lzTokenFee, nativeFee }
    }

    const sendClaim = async (lzTokenFee: BN, nativeFee: BN) => {
        const msgFee = {
            lzTokenFee: lzTokenFee,
            nativeFee: nativeFee,
        }
        const claimData = pdaHelper.getClaimDataPda(proxyProgram.programId, wallet.publicKey)
        const backwardFeePda = pdaHelper.getBackwardFeePda(proxyProgram.programId)
        const claimAccounts = {
            user: wallet.publicKey,
            claimData: claimData,
            proxyConfig: proxyConfigPda,
            peerConfig: peerConfigPda,
            backwardFee: backwardFeePda,
        }

        const requestIx = await proxyProgram.methods
            .sendClaim(msgFee)
            .accounts(claimAccounts)
            .remainingAccounts(sendRemainingAccounts)
            .instruction()
        const tx = await createAndSendV0Tx([requestIx], provider, wallet)
    }

    it('Claim Reward', async () => {
        if (wallet.publicKey.toString() !== 'DEQsSTjyRHHLN9nQ6BDhJy9aTbLDaRiFmsVLJhEV8bQE') {
            console.log('Please contact Zion or Dmitry to generate merkle proof for your address')
            return
        }
        const distributionId = 420394
        const cumulativeAmount = '1'
        // these proof only valid for solana address DEQsSTjyRHHLN9nQ6BDhJy9aTbLDaRiFmsVLJhEV8bQE
        const merkleProof = [
            '2924269a0a937d37e0ad32cfaca1378e9cfaea61e0f899bedf2c36ace63faa0f',
            '160e0c1f63803c827c8398ce521642033effd335935d7518fb19dac8b867d299',
            'b3eb9d2be1b3564f6278bca25c9e7e5af9ecac4940c0d0779b4ef0df2f9c7931',
        ]
        const merkleRoot = '0xba39fd1dd32722e7a129aea7edb58cd8c06a51729f569a0a07d26dd74b3362bc'

        await utils.submitProof(
            proxyProgram,
            provider,
            wallet.publicKey,
            wallet,
            distributionId,
            cumulativeAmount,
            merkleProof
        )

        const claimDataPda = pdaHelper.getClaimDataPda(proxyProgram.programId, wallet.publicKey)
        const claimData = await proxyProgram.account.claimData.fetch(claimDataPda)
        assert.equal(uint8ArrayToNumber(Uint8Array.from(claimData.distributionId)), distributionId)
        assert.equal(
            claimData.amount.toString(),
            utils.convertIntoBytes32(cumulativeAmount, constants.ORDER_DECIMALS_ON_ETHEREUM).toString()
        )
        assert.equal(uint8ArrayToHex(Uint8Array.from(claimData.root)), merkleRoot)
        assert.equal(claimData.user.toString(), wallet.publicKey.toString())

        const { lzTokenFee, nativeFee } = await quoteClaimFee()

        await sendClaim(lzTokenFee, nativeFee)
    })

    it('Send Request', async () => {
        const payloadType = constants.PayloadType.CreateOrderUnstakeRequest
        const payload = utils.checkPayload(payloadType, '1234')
        const { params } = utils.prepareParamsAndAccounts(
            proxyProgram,
            wallet.publicKey,
            payloadType,
            Buffer.from(payload),
            ENV
        )

        const { lzTokenFee, nativeFee } = await quoteFee(params)

        await sendRequest(params, lzTokenFee, nativeFee)
    })

    const guid = Array.from(Keypair.generate().publicKey.toBuffer())
    const initVerify = async (nonce: number) => {
        const peerAddress = utils.getPeerAddress(ENV)
        const payloadHashPda = pdaHelper.getPayloadHashPda(proxyConfigPda, orderlyEid, peerAddress, BigInt(nonce))
        await endpointProgram.methods
            .initVerify({
                srcEid: orderlyEid,
                sender: peerAddress,
                receiver: proxyConfigPda,
                nonce: new BN(nonce),
            })
            .accounts({
                payer: wallet.publicKey,
                nonce: noncePda,
                payloadHash: payloadHashPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin.payer])
            .rpc(confirmOptions)
    }

    const commitVerify = async (nonce: number, msg: any) => {
        const peerAddress = utils.getPeerAddress(ENV)
        const payloadHashPda = pdaHelper.getPayloadHashPda(proxyConfigPda, orderlyEid, peerAddress, BigInt(nonce))

        await ulnProgram.methods
            .commitVerification({
                nonce: new BN(nonce), // lz msg nonce from orderly chain to solana
                srcEid: orderlyEid,
                sender: new PublicKey(peerAddress), // on mock uln the sender is defined as PublicKey type, not the [u8;32]
                dstEid: solEid,
                receiver: Array.from(proxyConfigPda.toBytes()), // on mock uln the receiver is defined as[u8;32], not the PublicKey type
                guid: guid,
                message: Buffer.from(msg),
            })
            .accounts({
                uln: messageLibPda,
            })
            .remainingAccounts([
                {
                    pubkey: endpointProgram.programId,
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: messageLibPda, // receiver library
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: receiveLibraryConfigPda, // receive library config
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: defaultReceiveLibraryConfigPda, // default receive libary config
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: noncePda, // nonce
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: pendingInboundNoncePda, // pending inbound nonce
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: payloadHashPda, // payload hash
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: eventAuthorityPda,
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: endpointProgram.programId,
                    isWritable: true,
                    isSigner: false,
                },
            ])
            .rpc(confirmOptions)
    }

    const lzReceive = async (signer: Keypair, params: any, accounts: any, nonce: number) => {
        const peerAddress = utils.getPeerAddress(ENV)
        const payloadHashPda = pdaHelper.getPayloadHashPda(proxyConfigPda, orderlyEid, peerAddress, BigInt(nonce))
        const lzReceiveRemainingAccounts = [
            {
                pubkey: endpointProgram.programId,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: proxyConfigPda, // signer and receiver
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: oappRegistryPda,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: noncePda,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: payloadHashPda,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: endpointPda,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: eventAuthorityPda,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: endpointProgram.programId,
                isWritable: true,
                isSigner: false,
            },
        ]

        await proxyProgram.methods
            .lzReceive(params)
            .accounts(accounts)
            .remainingAccounts(lzReceiveRemainingAccounts)
            .signers([signer])
            .rpc(confirmOptions)
    }

    it('Withdraw USDC revenue', async () => {
        const proxyUsdcBalance = 1_000_000_000_000
        await mintTo(
            provider.connection,
            wallet.payer,
            USDC_MINT,
            proxyTokenAccount,
            usdcMintAuthority,
            proxyUsdcBalance
        )

        let prevProxyUSDCBalance = await getTokenBalance(provider.connection, proxyTokenAccount)
        assert.equal(prevProxyUSDCBalance, proxyUsdcBalance)

        let nonce = 1

        await initVerify(nonce)
        const payloadType = constants.PayloadType.ClaimUsdcRevenueBackward
        const tokenType = constants.LedgerToken.USDC
        const usdcAmount = 1234567890
        const payload = utils.convertIntoBytes32(usdcAmount.toString())
        const receiver = Keypair.generate()
        const receiverTokenAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            wallet.payer,
            USDC_MINT,
            receiver.publicKey
        )
        let prevReceiverUSDCBalance = await getTokenBalance(provider.connection, receiverTokenAccount.address)
        assert.equal(prevReceiverUSDCBalance, 0)
        let msg = Buffer.concat([
            Buffer.from([tokenType]),
            Buffer.from(receiver.publicKey.toBuffer()),
            Buffer.from([payloadType]),
            Buffer.from(payload),
        ])

        await commitVerify(nonce, msg)

        const params = {
            srcEid: orderlyEid,
            sender: peerAddress,
            nonce: new BN(nonce),
            guid: guid,
            message: Buffer.from(msg),
            extraData: Buffer.from(''),
        }

        const accounts = {
            payer: wallet.publicKey,
            proxyConfig: proxyConfigPda,
            peerConfig: peerConfigPda,
            tokenMint: USDC_MINT,
            proxyTokenAccount: proxyTokenAccount,
            receiver: receiver.publicKey,
            receiverTokenAccount: receiverTokenAccount.address,
            tokenProgram: TOKEN_PROGRAM_ID,
        }

        await lzReceive(wallet.payer, params, accounts, nonce)

        let curProxyUSDCBalance = await getTokenBalance(provider.connection, proxyTokenAccount)
        assert.equal(curProxyUSDCBalance, prevProxyUSDCBalance - usdcAmount)

        let curReceiverUSDCBalance = await getTokenBalance(provider.connection, receiverTokenAccount.address)
        assert.equal(curReceiverUSDCBalance, prevReceiverUSDCBalance + usdcAmount)
    })
})
