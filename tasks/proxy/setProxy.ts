import { task } from 'hardhat/config'
import { Program, workspace, BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    getPeerAddress,
    setupAnchor,
    printProxyConfig,
    getConfig,
    printPeerPda,
    getDeployedProxyProgram,
    updateConfig,
    getEndpoint,
    getUsdcTokenAccount,
    getOrderlyEid,
    getSolanaChainId,
    getTokenATA,
    createAndSendV0Tx,
    getOptions,
    delay,
    getUmi,
    getEncodedOptions,
    intoIx,
    getLzConfig,
    getQuoteRemainingAccounts,
    publicKeyIntoHex,
} from './utils'
import {
    getProxyConfigPda,
    getLzReceiveTypesPda,
    getPeerPda,
    getOAppRegistryPda,
    getReceiveLibConfigPda,
    getDefaultReceiveLibConfigPda,
    getSendLibProgramId,
    getReceiveLibProgramId,
    getDefaultSendLibConfigPda,
} from './pdaHelper'
import { PublicKey, AccountMeta, Connection } from '@solana/web3.js'
import { isAddress } from 'web3-validator'
import {
    fromWeb3JsInstruction,
    fromWeb3JsPublicKey,
    toWeb3JsInstruction,
    toWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters'

import {
    createNoopSigner,
    createSignerFromKeypair,
    signerIdentity,
    transactionBuilder,
    Transaction,
} from '@metaplex-foundation/umi'
import { bytes32ToEthAddress, Options } from '@layerzerolabs/lz-v2-utilities'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { PEER_ADDRESS } from './constants'
import { config } from 'process'

task('sol:proxy:init', 'Create and init Proxy Config PDA')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        console.log('Wallet:', wallet.publicKey.toBase58())
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const lzReceiveTypesPda = getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)
        const endpoint = getEndpoint()
        const usdcTokenAccount = getUsdcTokenAccount(taskArgs.env)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const solChainId = getSolanaChainId(taskArgs.env)
        const proxyTokenAccount = getTokenATA(usdcTokenAccount, proxyConfigPda)
        const oappRegistryPda = getOAppRegistryPda(proxyConfigPda)
        const admin = wallet
        const peerAddress = getPeerAddress(taskArgs.env)

        console.log('OApp Registry PDA:', oappRegistryPda.toBase58())
        try {
            const proxyConfig = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)
            printProxyConfig(proxyConfig)
        } catch {
            const initProxyParams = {
                endpointProgram: endpoint.program,
                usdcTokenAccount: usdcTokenAccount,
                admin: wallet.publicKey,
                orderlyEid: orderlyEid,
                solChainId: new BN(solChainId),
            }
            const initProxyAccounts = {
                payer: wallet.publicKey,
                proxyConfig: proxyConfigPda,
                lzReceiveTypesAccounts: lzReceiveTypesPda,
                proxyTokenAccount: proxyTokenAccount,
                tokenMint: usdcTokenAccount,
            }
            const registerRemainingAccounts = endpoint.getRegisterOappIxAccountMetaForCPI(
                wallet.publicKey,
                proxyConfigPda
            )
            const initProxyIx = await proxyProgram.methods
                .initProxy(initProxyParams)
                .accounts(initProxyAccounts)
                .remainingAccounts(registerRemainingAccounts)
                .instruction()
            const tx = await createAndSendV0Tx([initProxyIx], provider, wallet)
            console.log('Tx to init Proxy as OAPP:', tx)
            await delay(taskArgs.env)
        }

        try {
            const initOAppNonceIx = endpoint.initOAppNonce(admin.publicKey, orderlyEid, proxyConfigPda, peerAddress!)
            const tx = await createAndSendV0Tx([initOAppNonceIx], provider, wallet)
            console.log('Tx to init OApp Nonce for Solana Proxy:', tx)
            await delay(taskArgs.env)
        } catch {
            console.log('OApp Nonce already initialized')
        }

        try {
            const initSendLibIx = endpoint.initSendLibrary(wallet.publicKey, proxyConfigPda, orderlyEid)
            const tx = await createAndSendV0Tx([initSendLibIx], provider, wallet)
            console.log('Tx to init Send Lib for Solana Proxy:', tx)
            await delay(taskArgs.env)
        } catch {
            console.log('Send lib already initialized')
        }

        try {
            const initReceiveLibIx = endpoint.initReceiveLibrary(wallet.publicKey, proxyConfigPda, orderlyEid)
            const tx = await createAndSendV0Tx([initReceiveLibIx], provider, wallet)
            console.log('Tx to init Receive Lib for Solana Proxy:', tx)
            await delay(taskArgs.env)
        } catch {
            console.log('Receive lib already initialized')
        }

        try {
            const sendLibProgramId = getSendLibProgramId()
            const setSendLibIx = endpoint.setSendLibrary(wallet.publicKey, proxyConfigPda, sendLibProgramId, orderlyEid)
            const tx = await createAndSendV0Tx([setSendLibIx], provider, wallet)
            console.log('Tx to set Send Lib for Solana Proxy:', tx)
            await delay(taskArgs.env)
        } catch (e) {
            console.log('Receive lib already set')
        }

        try {
            const receiveLibProgramId = getReceiveLibProgramId()
            const setReceiveLibIx = endpoint.setReceiveLibrary(
                wallet.publicKey,
                proxyConfigPda,
                receiveLibProgramId,
                orderlyEid,
                BigInt(0)
            )
            const tx = await createAndSendV0Tx([setReceiveLibIx], provider, wallet)
            console.log('Tx to set Receive Lib for Solana Proxy:', tx)
            await delay(taskArgs.env)
        } catch {
            console.log('Receive lib already set')
        }
    })

task('sol:proxy:setpeer', 'Set Peer Config for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        console.log('Wallet:', wallet.publicKey.toBase58())
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const endpoint = getEndpoint()
        const usdcTokenAccount = getUsdcTokenAccount(taskArgs.env)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const solChainId = getSolanaChainId(taskArgs.env)
        const proxyTokenAccount = getTokenATA(usdcTokenAccount, proxyConfigPda)
        const peerPda = getPeerPda(proxyProgram.programId, proxyConfigPda, orderlyEid)
        const peerAddress = getPeerAddress(taskArgs.env)

        const admin = createNoopSigner(fromWeb3JsPublicKey(wallet.publicKey))
        const oftStore = fromWeb3JsPublicKey(proxyConfigPda)
        const options = getOptions(taskArgs.env)
        const [optionSend, optionSendAndCall] = getEncodedOptions(options)
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

        const ix = intoIx(wrappedIx)
        const tx = await createAndSendV0Tx(ix, provider, wallet)
        console.log('Tx to set Peer for Solana Proxy:', tx)
        await delay(taskArgs.env)
    })

task('sol:proxy:setconfig', 'Set Config for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const oftStore = fromWeb3JsPublicKey(proxyConfigPda)
        const programId = fromWeb3JsPublicKey(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        console.log(orderlyEid)
        console.log(oftStore)
        const rpc = getUmi(taskArgs.env).rpc
        const admin = createNoopSigner(fromWeb3JsPublicKey(wallet.publicKey))

        try {
            const initIx = [
                oft.initConfig(
                    {
                        admin: admin,
                        oftStore: oftStore,
                        payer: admin,
                    },
                    orderlyEid
                ),
            ]
            const ix = intoIx(initIx)
            const tx = await createAndSendV0Tx(ix, provider, wallet)
            console.log('Tx to init Config for Solana Proxy:', tx)
            await delay(taskArgs.env)
        } catch (e) {
            console.log('Config already initialized')
        }

        const connection = new Connection(rpc.getEndpoint(), 'confirmed')
        const config = getLzConfig(orderlyEid)
        const ix = [
            await oft.setConfig(
                connection,
                {
                    signer: admin.publicKey,
                    oftStore: oftStore,
                },
                {
                    remoteEid: orderlyEid,
                    configType: 1, // EXECUTOR
                    config: {
                        maxMessageSize: config.sendLibConfig.executorConfig.maxMessageSize,
                        executor: new PublicKey(config.sendLibConfig.executorConfig.executorAddress),
                    },
                }
            ),
            await oft.setConfig(
                connection,
                {
                    signer: admin.publicKey,
                    oftStore: oftStore,
                },
                {
                    remoteEid: orderlyEid,
                    configType: 2, // SEND ULN
                    config: {
                        confirmations: config.sendLibConfig.ulnConfig.confirmations,
                        requiredDvnCount: config.sendLibConfig.ulnConfig.requiredDVNCount,
                        optionalDvnCount: config.sendLibConfig.ulnConfig.optionalDVNCount,
                        optionalDvnThreshold: config.sendLibConfig.ulnConfig.optionalDVNThreshold,
                        requiredDvns: config.sendLibConfig?.ulnConfig.requiredDVNs.map(
                            (address) => new PublicKey(address)
                        ), // [new Web3PublicKey(config.sendLibConfig?.ulnConfig.requiredDVNs[0]!)]
                        optionalDvns: [],
                    },
                }
            ),

            await oft.setConfig(
                connection,
                {
                    signer: admin.publicKey,
                    oftStore: oftStore,
                },
                {
                    remoteEid: orderlyEid,
                    configType: 3, // RECEIVE ULN
                    config: {
                        confirmations: config.receiveLibConfig?.ulnConfig.confirmations,
                        requiredDvnCount: config.receiveLibConfig?.ulnConfig.requiredDVNCount,
                        optionalDvnCount: config.receiveLibConfig?.ulnConfig.optionalDVNCount,
                        optionalDvnThreshold: config.receiveLibConfig?.ulnConfig.optionalDVNThreshold,
                        requiredDvns: config.receiveLibConfig?.ulnConfig.requiredDVNs.map(
                            (address) => new PublicKey(address)
                        ), // [new Web3PublicKey(config.sendLibConfig?.ulnConfig.requiredDVNs[0]!)]
                        optionalDvns: [],
                    },
                }
            ),
        ]

        const web3Ix = ix.map((ix) => toWeb3JsInstruction(ix))
        const tx = await createAndSendV0Tx(web3Ix, provider, wallet)
        console.log('Tx to set Config for Solana Proxy:', tx)
    })

task('sol:proxy:getconfig', 'Get Config for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const oftStore = fromWeb3JsPublicKey(proxyConfigPda)
        const programId = fromWeb3JsPublicKey(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const rpc = getUmi(taskArgs.env).rpc

        const delegate = await oft.getDelegate(rpc, oftStore)
        console.log('Delegate:', delegate.toString())
        const peerAddress = await oft.getPeerAddress(rpc, oftStore, orderlyEid, programId)
        console.log('Peer Address:', peerAddress)

        const enforcedOptions = await oft.getEnforcedOptions(rpc, oftStore, orderlyEid, programId)
        const options = getOptions(taskArgs.env)
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
        console.log(
            `The option set onchain for sendAndCall: `,
            Buffer.from(enforcedOptions.sendAndCall).toString('hex')
        )

        try {
            const endpointConfig = await oft.getEndpointConfig(rpc, oftStore, orderlyEid)
            // sleep for 2
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
            console.log(
                `           - requiredDvnCount: `,
                endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.requiredDvnCount
            )
            console.log(
                `           - optionalDvns: `,
                endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.optionalDvns.toLocaleString()
            )
            console.log(
                `           - optionalDvnCount: `,
                endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.optionalDvnCount
            )
            console.log(
                `           - optionalDvnThreshold: `,
                endpointConfig.sendLibraryConfig.ulnSendConfig?.uln.optionalDvnThreshold
            )
            console.log(`        - executor: `)
            console.log(
                `           - maxMessageSize: `,
                endpointConfig.sendLibraryConfig.ulnSendConfig?.executor.maxMessageSize
            )
            console.log(
                `           - executor: `,
                endpointConfig.sendLibraryConfig.ulnSendConfig?.executor.executor.toString()
            )

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
        } catch (e) {
            console.log(e)
            // console.log("Using default endpoint config")
            console.log(`🛎️ Config for orderly network not set yet, please set it`)
        }
    })

task('sol:proxy:quote', 'Get quote for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('payloadType', 'The payload type to quote', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const rpc = getUmi(taskArgs.env).rpc
        const connection = new Connection(rpc.getEndpoint(), 'confirmed')
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const peerConfigPda = getPeerPda(proxyProgram.programId, proxyConfigPda, orderlyEid)
        const receiver = bytes32ToEthAddress(getPeerAddress(taskArgs.env)!)
        const sender = publicKeyIntoHex(proxyConfigPda)
        const path = {
            sender: sender,
            dstEid: orderlyEid,
            receiver: receiver,
        }
        const remainingAccounts = await getQuoteRemainingAccounts(connection, wallet, path)

        console.log('remaining accounts:', remainingAccounts.length)

        const quoteAccounts = {
            proxyConfig: proxyConfigPda,
            peerConfig: peerConfigPda,
        }

        const quoteParams = {
            payloadType: 1,
            amount: new BN(100),
            userAccount: wallet.publicKey,
        }

        const { lzTokenFee, nativeFee } = await proxyProgram.methods
            .quoteRequest(quoteParams)
            .accounts(quoteAccounts)
            .remainingAccounts(remainingAccounts)
            .view()

        console.log('native fee:', nativeFee)
    })
