import { task } from 'hardhat/config'
import bs58 from 'bs58'
import { Program, workspace, BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    getPeerAddress,
    setupAnchor,
    printProxyConfig,
    printPeerPda,
    getDeployedProxyProgram,
    updateConfig,
    getEndpoint,
    getTokenATA,
    getOrderlyEid,
    getSolanaChainId,
    createAndSendV0Tx,
    getOptions,
    delay,
    getUmi,
    getEncodedOptions,
    intoIx,
    getLzConfig,
    getQuoteRemainingAccounts,
    publicKeyIntoHex,
    amountStrToBytes32,
    getSendRemainingAccounts,
    printTxLinks,
    createAndSendV0TxWithTable,
    getDeployedOftProgram,
    checkPayloadType,
    getPayloadType,
    createComposeMsgForStaking,
    getChainEventId,
    getPayload,
    getAmountFromStr,
    getOftAccounts,
    getUsdcMint,
    getInitOAppRemainingAccounts,
    getAccountsForEndpointV2Send,
    createALT,
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
import { PublicKey, AccountMeta, Connection, ComputeBudgetProgram } from '@solana/web3.js'
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
    TransactionBuilder,
} from '@metaplex-foundation/umi'
import { bytes32ToEthAddress, Options } from '@layerzerolabs/lz-v2-utilities'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { EventPDADeriver, SendHelper } from '@layerzerolabs/lz-solana-sdk-v2'
import { DECIMALS_SCALE_FACTOR, ORDER_DECIMALS_ON_ETHEREUM } from './constants'
import { config } from 'process'
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

task('sol:proxy:init', 'Create and init Proxy Config PDA')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        console.log('Proxy Config PDA:', proxyConfigPda.toBase58())
        const lzReceiveTypesPda = getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)
        const endpoint = getEndpoint()
        const usdcMint = getUsdcMint(taskArgs.env)
        console.log(usdcMint)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const solChainId = getSolanaChainId(taskArgs.env)
        const proxyTokenAccount = getTokenATA(usdcMint, proxyConfigPda)
        const oappRegistryPda = getOAppRegistryPda(proxyConfigPda)
        const admin = wallet
        const peerAddress = getPeerAddress(taskArgs.env)
        console.log('proxy config pda', proxyConfigPda.toBase58())
        console.log('OApp Registry PDA:', oappRegistryPda.toBase58())
        try {
            const proxyConfig = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)
            printProxyConfig(proxyConfig)
        } catch (e) {
            console.log(e)
            console.log('Proxy Config not found, initializing...')
            const initProxyParams = {
                endpointProgram: endpoint.program,
                usdcTokenAccount: usdcMint,
                admin: admin.publicKey,
                orderlyEid: orderlyEid,
                solChainId: solChainId,
            }
            const initProxyAccounts = {
                payer: wallet.publicKey,
                proxyConfig: proxyConfigPda,
                lzReceiveTypesAccounts: lzReceiveTypesPda,
                proxyTokenAccount: proxyTokenAccount,
                tokenMint: usdcMint,
            }
            const registerRemainingAccounts = getInitOAppRemainingAccounts(wallet, proxyConfigPda)
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
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const usdcMint = getUsdcMint(taskArgs.env)
        const orderlyEid = getOrderlyEid(taskArgs.env)
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
        const orderlyEid = getOrderlyEid(taskArgs.env)
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
                        requiredDvns: config.sendLibConfig.ulnConfig.requiredDVNs.map(
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
    .addOptionalParam('payload', 'The payload to quote', '0', devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const rpc = getUmi(taskArgs.env).rpc
        const connection = new Connection(rpc.getEndpoint(), 'confirmed')
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const peerConfigPda = getPeerPda(proxyProgram.programId, proxyConfigPda, orderlyEid)
        const msgReceiver = bytes32ToEthAddress(getPeerAddress(taskArgs.env)!)
        const msgSender = publicKeyIntoHex(proxyConfigPda)
        const path = {
            sender: msgSender,
            dstEid: orderlyEid,
            receiver: msgReceiver,
        }
        const remainingAccounts = await getQuoteRemainingAccounts(connection, wallet, path)

        console.log('remaining accounts:', remainingAccounts.length)

        const quoteAccounts = {
            proxyConfig: proxyConfigPda,
            peerConfig: peerConfigPda,
        }
        const payloadType = checkPayloadType(taskArgs.payloadType)
        const amount = taskArgs.payload
            ? amountStrToBytes32(taskArgs.payload, ORDER_DECIMALS_ON_ETHEREUM)
            : amountStrToBytes32('0', ORDER_DECIMALS_ON_ETHEREUM)
        const quoteParams = {
            userAccount: wallet.publicKey,
            payloadType: payloadType,
            payload: Buffer.from(amount),
        }

        const { lzTokenFee, nativeFee } = await proxyProgram.methods
            .quoteRequest(quoteParams)
            .accounts(quoteAccounts)
            .remainingAccounts(remainingAccounts)
            .view()

        console.log('native fee:', nativeFee.toString())
    })

task('sol:proxy:request', 'Send request for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('payloadType', 'The payload type to request', undefined, devtoolsTypes.string)
    .addOptionalParam('payload', 'The payload to request', '0', devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet, rpcString] = setupAnchor(taskArgs.env)
        const payloadType = checkPayloadType(taskArgs.payloadType)

        if (payloadType === getPayloadType().Stake) {
            console.log('Stake')
            const payload = getPayload(payloadType, taskArgs.payload)
            const amount = getAmountFromStr(taskArgs.payload)
            const oftProgram = getDeployedOftProgram(taskArgs.env, provider)
            const orderlyEid = getOrderlyEid(taskArgs.env)
            const stakingOptions = Options.newOptions()
                .addExecutorLzReceiveOption(0, 500000)
                .addExecutorComposeOption(0, 500000, 0)
                .toBytes()

            const composeMsg = createComposeMsgForStaking(
                getSolanaChainId(taskArgs.env),
                payloadType,
                payload!,
                getChainEventId(taskArgs.env),
                wallet.publicKey
            )
            const rpc = getUmi(taskArgs.env).rpc
            const oftAccounts = getOftAccounts(taskArgs.env)
            console.log(wallet)
            console.log('1')
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
                    amountLd: amount,
                    minAmountLd: amount,
                    options: stakingOptions,
                    composeMsg: composeMsg,
                    payInLzToken: false,
                },
                {
                    oft: oftAccounts.programId,
                }
            )

            console.log('lzTokenFee:', lzTokenFee.toString())
            console.log('nativeFee:', nativeFee.toString())

            const [eventAuthorityPDA] = new EventPDADeriver(oftAccounts.programId).eventAuthority()

            const oftSendParams = {
                dstEid: orderlyEid,
                to: oftAccounts.ledgerOccManger,
                amountLd: new BN(1),
                minAmountLd: new BN(1),
                options: Buffer.from(stakingOptions),
                composeMsg: Buffer.from(composeMsg),
                nativeFee: new BN(985540), // convert from bigint into BN
                lzTokenFee: new BN(0),
            }

            // const oftSendParams = {
            //     dstEid: toEid,
            //     to: Array.from(recipientAddressBytes32),
            //     amountLd: new BN(amount),
            //     minAmountLd: new BN(((BigInt(amount) * BigInt(9)) / BigInt(10)).toString()),
            //     options: Buffer.from(options),
            //     composeMsg: Buffer.from(composeMsg),
            //     nativeFee,
            //     lzTokenFee: new BN(0),
            // }

            const oftPeerPda = getPeerPda(oftAccounts.programId, oftAccounts.oftStore, orderlyEid)
            const senderATA = getTokenATA(wallet.publicKey, oftAccounts.mint)
            const oftSendAccounts = {
                signer: wallet.publicKey,
                peer: oftPeerPda,
                oftStore: oftAccounts.oftStore,
                tokenSource: senderATA,
                tokenEscrow: oftAccounts.escrow,
                tokenMint: oftAccounts.mint,
                tokenProgram: TOKEN_PROGRAM_ID,
                eventAuthority: oftPeerPda,
                program: oftAccounts.programId,
            }

            const connection = new Connection(rpc.getEndpoint(), 'confirmed')
            const msgReceiver = bytes32ToEthAddress(oftAccounts.evmOftAddress)
            const msgSender = publicKeyIntoHex(oftAccounts.oftStore)
            const path = {
                sender: msgSender,
                dstEid: orderlyEid,
                receiver: msgReceiver,
            }
            const remainingAccounts = await getSendRemainingAccounts(connection, wallet, path)
            const ixSend = await oftProgram.methods
                .send(oftSendParams)
                .accounts(oftSendAccounts)
                .remainingAccounts(remainingAccounts)
                .instruction()
            const ixAddComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
            await createALT(provider, wallet)
            // return await createAndSendV0Tx([ixSend], provider, wallet)

            // const umi = getUmi(taskArgs.env)
            // console.log('hi')
            // const payer = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey))
            // umi.use(signerIdentity(payer))
            // console.log(payer)
            // const ix = await oft.send(
            //     rpc,
            //     {
            //         payer: payer,
            //         tokenMint: oftAccounts.mint,
            //         tokenEscrow: fromWeb3JsPublicKey(oftAccounts.escrow),
            //         tokenSource: fromWeb3JsPublicKey(oftAccounts.escrow),
            //     },
            //     {
            //         to: oftAccounts.ledgerOccManger,
            //         dstEid: orderlyEid,
            //         amountLd: amount,
            //         minAmountLd: amount,
            //         options: stakingOptions,
            //         composeMsg: composeMsg,
            //         nativeFee,
            //     },
            //     {
            //         oft: oftAccounts.programId,
            //     }
            // )
            // console.log('hi2')
            // const { signature } = await new TransactionBuilder([ix])
            //     .add(setComputeUnitLimit(umi, { units: 500_000 }))
            //     .sendAndConfirm(umi)

            // console.log('hi')
            // const transactionSignatureBase58 = bs58.encode(signature)
            // printTxLinks(taskArgs.env, transactionSignatureBase58)
        }

        return

        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)

        const rpc = getUmi(taskArgs.env).rpc
        const connection = new Connection(rpc.getEndpoint(), 'confirmed')
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const peerConfigPda = getPeerPda(proxyProgram.programId, proxyConfigPda, orderlyEid)
        const msgReceiver = bytes32ToEthAddress(getPeerAddress(taskArgs.env)!)
        const msgSender = publicKeyIntoHex(proxyConfigPda)
        const path = {
            sender: msgSender,
            dstEid: orderlyEid,
            receiver: msgReceiver,
        }
        const remainingAccounts = await getQuoteRemainingAccounts(connection, wallet, path)
        const quoteAccounts = {
            proxyConfig: proxyConfigPda,
            peerConfig: peerConfigPda,
        }
        console.log(taskArgs.payload)
        const amount = taskArgs.payload
            ? amountStrToBytes32(taskArgs.payload, ORDER_DECIMALS_ON_ETHEREUM)
            : amountStrToBytes32('0', ORDER_DECIMALS_ON_ETHEREUM)
        console.log(amount)
        const quoteParams = {
            userAccount: wallet.publicKey,
            payloadType: payloadType,
            payload: Buffer.from(amount),
        }

        const { lzTokenFee, nativeFee } = await proxyProgram.methods
            .quoteRequest(quoteParams)
            .accounts(quoteAccounts)
            .remainingAccounts(remainingAccounts)
            .view()

        const msgFee = {
            nativeFee: nativeFee,
            lzTokenFee: lzTokenFee,
        }

        const sendRemainingAccounts = await getSendRemainingAccounts(connection, wallet, path)

        const requestIx = await proxyProgram.methods
            .sendRequest(quoteParams, msgFee)
            .accounts(quoteAccounts)
            .remainingAccounts(sendRemainingAccounts)
            .instruction()
        const tx = await createAndSendV0Tx([requestIx], provider, wallet)
        console.log('Tx to send request for Solana Proxy:', tx)
        printTxLinks(taskArgs.env, tx)
    })
task('sol:proxy:claim', 'Send request for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('distributionId', 'Distribution ID of the reward', 0, devtoolsTypes.int)
    .addParam('cumulativeAmount', 'cumulative amount of reward from Mrekle proof', '0', devtoolsTypes.string)
    .addParam('merkleProof', 'Merkle proof of the reward', '', devtoolsTypes.csv)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        const rpc = getUmi(taskArgs.env).rpc
        const connection = new Connection(rpc.getEndpoint(), 'confirmed')
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const peerConfigPda = getPeerPda(proxyProgram.programId, proxyConfigPda, orderlyEid)
        const msgReceiver = bytes32ToEthAddress(getPeerAddress(taskArgs.env)!)
        const msgSender = publicKeyIntoHex(proxyConfigPda)
        console.log('Claiming reward from the Solana network...')
        console.log('Distribution ID:', taskArgs.distributionId)
        console.log('cumulative amount:', taskArgs.cumulativeAmount)
        console.log('Merkle proof:', taskArgs.merkleProof)
        console.log('Proxy program ID:', proxyProgram.programId.toBase58())

        const cumulativeAmountArray = amountStrToBytes32(taskArgs.cumulativeAmount, ORDER_DECIMALS_ON_ETHEREUM)
        const proofArray = taskArgs.merkleProof.map((p: string) =>
            Array.from(Uint8Array.from(Buffer.from(p.slice(2), 'hex')))
        )

        const claimRewardParams = {
            distributionId: taskArgs.distributionId,
            cumulativeAmount: cumulativeAmountArray,
            merkleProof: proofArray,
        }

        const claimRewardAccounts = {
            user: wallet.publicKey,
        }

        // TODO: Call quote to get the fee
        const nativeFee = 123456

        const sendParam = {
            nativeFee: new BN(nativeFee),
            lzTokenFee: new BN(0),
        }

        // const metaplexOftSendRemainingAccounts = await getAllOftSendAccounts(provider, config.oftProgramId, config.oftEscrowAta, wallet.publicKey, getOrderlyEid());
        // console.log('Send remaining accounts:', metaplexOftSendRemainingAccounts);
        // const web3OftSendRemainingAccounts = metaplexToWeb3AccountMetaArray(metaplexOftSendRemainingAccounts);

        const ixClaimReward = await proxyProgram.methods
            .claimReward(claimRewardParams, sendParam)
            .accounts(claimRewardAccounts)
            .instruction()

        const txSig = await createAndSendV0Tx([ixClaimReward], provider, wallet)
        console.log('Tx to claim reward for Solana Proxy:', txSig)
        printTxLinks(taskArgs.env, txSig)
    })

task('sol:proxy:pda', 'Get PDA for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet, rpc] = setupAnchor(taskArgs.env)
        const proxyProgram = getDeployedProxyProgram(taskArgs.env, provider)
        console.log('Proxy program ID:', proxyProgram.programId)
    })
