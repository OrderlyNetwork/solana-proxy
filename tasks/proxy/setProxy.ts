import { task } from 'hardhat/config'
import bs58 from 'bs58'
import { Program, workspace, BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    getPeerAddress,
    setupAnchor,
    printProxyConfig,
    getProxyProgram,
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
    printTxLinks,
    createAndSendV0TxWithTable,
    getOftProgram,
    checkPayloadType,
    getProxyAccounts,
    getUsdcMint,
    getInitOAppRemainingAccounts,
    quoteStakingFee,
    sendStakingRequest,
    quoteFee,
    sendRequest,
    quoteClaimFee,
    sendClaimRequest,
    submitProof,
    checkPayload,
    printEndpointConfig,
    printOptions,
    getBackwardFee,
} from './utils'
import * as constants from './constants'
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
    getClaimDataPda,
    getBackwardFeePda,
} from './pdaHelper'
import { PublicKey, AccountMeta, Connection, ComputeBudgetProgram } from '@solana/web3.js'
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
import { EventPDADeriver, SendHelper, EndpointProgram, EndpointPDADeriver } from '@layerzerolabs/lz-solana-sdk-v2'
import { DECIMALS_SCALE_FACTOR, ORDER_DECIMALS_ON_ETHEREUM } from './constants'
import { config } from 'process'
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { bigint } from 'hardhat/internal/core/params/argumentTypes'

task('sol:proxy:init', 'Create and init Proxy Config PDA')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        console.log('Proxy Config PDA:', proxyConfigPda.toBase58())
        const lzReceiveTypesPda = getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)
        const endpoint = getEndpoint()
        const usdcMint = getUsdcMint(taskArgs.env)
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
            const initRemainingAccounts = getInitOAppRemainingAccounts(wallet, proxyConfigPda)
            const initProxyIx = await proxyProgram.methods
                .initProxy(initProxyParams)
                .accounts(initProxyAccounts)
                .remainingAccounts(initRemainingAccounts)
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
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
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
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
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

task('sol:proxy:setfee', 'Set backwar fee for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const backwardFeePda = getBackwardFeePda(proxyProgram.programId)
        const { orderBackwardFee, usdcBackwardFee } = getBackwardFee()
        const ixSetBackwardFee = await proxyProgram.methods
            .setBackwardFee({
                orderBackwardFee: orderBackwardFee,
                usdcBackwardFee: usdcBackwardFee,
            })
            .accounts({ admin: wallet.publicKey, proxyConfig: proxyConfigPda, backwardFee: backwardFeePda })
            .instruction()
        const tx = await createAndSendV0Tx([ixSetBackwardFee], provider, wallet)
        console.log('Tx to set Backward Fee for Solana Proxy:', tx)
    })

task('sol:proxy:withdrawfee', 'Withdraw fee for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    // .addParam('amount', 'The amount to withdraw', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const amount = new BN(1234568)
        const { orderBackwardFee, usdcBackwardFee } = getBackwardFee()
        const ixWithdrawFee = await proxyProgram.methods
            .withdrawFee({ amount: amount })
            .accounts({ admin: wallet.publicKey, proxyConfig: proxyConfigPda, feeCollector: wallet.publicKey })
            .instruction()
        const tx = await createAndSendV0Tx([ixWithdrawFee], provider, wallet)
        console.log('Tx to withdraw fee for Solana Proxy:', tx)
    })

task('sol:proxy:pause', 'Pause Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('paused', 'The paused state', undefined, devtoolsTypes.boolean)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        console.log(taskArgs.paused)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const ixSetPause = await proxyProgram.methods
            .setPause({ paused: taskArgs.paused })
            .accounts({
                admin: wallet.publicKey,
                proxyConfig: proxyConfigPda,
            })
            .instruction()
        const tx = await createAndSendV0Tx([ixSetPause], provider, wallet)
        console.log('Tx to set Pause for Solana Proxy:', tx)
    })

task('sol:proxy:admin', 'Transfer Admin for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const proxyAccounts = getProxyAccounts(taskArgs.env)
        const oftStore = proxyConfigPda
        const [oAppRegistry] = new EndpointPDADeriver(constants.ENDPOINT_PROGRAM_ID).oappRegistry(oftStore)
        const [endpointEventAuthority] = new EventPDADeriver(constants.ENDPOINT_PROGRAM_ID).eventAuthority()
        const endpointProgram = getEndpoint()
        const keys = EndpointProgram.instructions.createSetDelegateInstructionAccounts(
            {
                oapp: oftStore,
                oappRegistry: oAppRegistry,
                eventAuthority: endpointEventAuthority,
                program: endpointProgram.program,
            },
            endpointProgram.program
        )

        for (const acc of keys) {
            acc.isSigner = false
        }

        let remainingAccounts = []

        remainingAccounts.push(
            {
                pubkey: endpointProgram.program,
                isSigner: false,
                isWritable: false,
            },
            ...keys
        )

        // console.log('remainingAccounts', remainingAccounts)

        const ixSetDelegateAndAdmin = await proxyProgram.methods
            .setDelegate({ delegate: proxyAccounts.multisig })
            .accounts({
                admin: wallet.publicKey,
                proxyConfig: proxyConfigPda,
            })
            .remainingAccounts(remainingAccounts)
            .instruction()

        const ixTransferAdmin = await proxyProgram.methods
            .transferAdmin({ newAdmin: proxyAccounts.multisig })
            .accounts({ admin: wallet.publicKey, proxyConfig: proxyConfigPda })
            .instruction()
        const tx = await createAndSendV0Tx([ixSetDelegateAndAdmin, ixTransferAdmin], provider, wallet)
        console.log('Tx to set Delegate and Admin for Solana Proxy:', tx)
    })

task('sol:proxy:getconfig', 'Get Config for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const oftStore = fromWeb3JsPublicKey(proxyConfigPda)
        const programId = fromWeb3JsPublicKey(proxyProgram.programId)
        const orderlyEid = getOrderlyEid(taskArgs.env)
        const rpc = getUmi(taskArgs.env).rpc

        console.log('=============== Proxy Config ===============')
        const proxyConfigData = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)
        printProxyConfig(proxyConfigData)

        console.log('=============== OAPP Options ===============')
        const peerAddress = await oft.getPeerAddress(rpc, oftStore, orderlyEid, programId)
        console.log('Peer Address:', '0x' + peerAddress.slice(26).toString())
        const enforcedOptions = await oft.getEnforcedOptions(rpc, oftStore, orderlyEid, programId)
        const options = getOptions(taskArgs.env)
        printOptions(options, enforcedOptions)

        try {
            console.log('=============== Endpoint Config ===============')

            const delegate = await oft.getDelegate(rpc, oftStore)
            console.log('Delegate:', delegate.toString())
            const endpointConfig = await oft.getEndpointConfig(rpc, oftStore, orderlyEid)

            printEndpointConfig(endpointConfig)
        } catch (e) {
            console.log(`🛎️ Config for orderly network not set yet, please set it first`)
        }
    })

task('sol:proxy:quote', 'Get quote for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('payloadType', 'The payload type to quote', undefined, devtoolsTypes.string)
    .addParam('payload', 'The payload to quote', '0', devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)

        const payloadType = checkPayloadType(taskArgs.payloadType)
        const payload = checkPayload(payloadType, taskArgs.payload)
        await quoteFee(proxyProgram, wallet.publicKey, payloadType, Buffer.from(payload), taskArgs.env)
    })

task('sol:proxy:request', 'Send request for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('payloadType', 'The payload type to request', undefined, devtoolsTypes.string)
    .addOptionalParam('payload', 'The payload to request', '0', devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet, rpcString] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)

        const payloadType = checkPayloadType(taskArgs.payloadType)
        const payload = checkPayload(payloadType, taskArgs.payload)

        const { lzTokenFee, nativeFee } = await quoteFee(
            proxyProgram,
            wallet.publicKey,
            payloadType,
            Buffer.from(payload),
            taskArgs.env
        )

        const tx = await sendRequest(
            proxyProgram,
            provider,
            wallet,
            payloadType,
            Buffer.from(payload),
            nativeFee,
            lzTokenFee,
            taskArgs.env
        )
        printTxLinks(taskArgs.env, tx)
    })

task('sol:proxy:pda', 'Get PDA for Solana Proxy and Solana OFT')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addFlag('extendAlt', 'Extend ALT for Solana OFT')
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet, rpc] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        console.log('Proxy program ID:', proxyProgram.programId)
        const usdcMint = getUsdcMint(taskArgs.env)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        console.log('Proxy Config PDA:', proxyConfigPda.toBase58())

        const proxyTokenAccount = getTokenATA(usdcMint, proxyConfigPda)
        console.log('Proxy Token Account:', proxyTokenAccount.toBase58())

        const lzReceiveTypesPda = getLzReceiveTypesPda(proxyProgram.programId, proxyConfigPda)
        console.log('LZ Receive Types PDA:', lzReceiveTypesPda.toBase58())
    })

task('sol:proxy:lzReceiveTypes', 'Get LZ Receive Types for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
    })

task('sol:proxy:stake', 'Stake from Solana through Solana OFT')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('amount', 'The amount (WITHOUT DECIMALS) to stake', undefined, devtoolsTypes.string)
    .addFlag('extendAlt', 'Extend ALT for Solana OFT')
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const { lzTokenFee, nativeFee } = await quoteStakingFee(wallet, taskArgs.amount, taskArgs.env)
        console.log('lzTokenFee:', lzTokenFee.toString())
        console.log('nativeFee:', nativeFee.toString())
        let extendAlt = false
        if (taskArgs.extendAlt) {
            extendAlt = true
        }
        const tx = await sendStakingRequest(
            provider,
            wallet,
            taskArgs.amount,
            nativeFee.toString(),
            taskArgs.env,
            extendAlt
        )
        printTxLinks(taskArgs.env, tx)
    })

task('sol:proxy:submitproof', 'Send request for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .addParam('distributionId', 'Distribution ID of the reward', 0, devtoolsTypes.int)
    .addParam('cumulativeAmount', 'cumulative amount of reward from Mrekle proof', '0', devtoolsTypes.string)
    .addParam('merkleProof', 'Merkle proof of the reward', '', devtoolsTypes.csv)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)

        console.log('Claiming reward from the Solana network...')
        console.log('Distribution ID:', taskArgs.distributionId)
        console.log('cumulative amount:', taskArgs.cumulativeAmount)
        console.log('Merkle proof:', taskArgs.merkleProof, taskArgs.merkleProof.length)
        console.log('Proxy program ID:', proxyProgram.programId.toBase58())

        const tx = await submitProof(
            proxyProgram,
            provider,
            wallet.publicKey,
            wallet,
            taskArgs.distributionId,
            taskArgs.cumulativeAmount,
            taskArgs.merkleProof
        )
        printTxLinks(taskArgs.env, tx)
    })

task('sol:proxy:quoteclaim', 'Quote claim for Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const claimDataPda = getClaimDataPda(proxyProgram.programId, wallet.publicKey)
        let claimData
        try {
            claimData = await proxyProgram.account.claimData.fetch(claimDataPda)
            console.log('Distribution ID:', claimData.distributionId)
            console.log('Cumulative amount:', claimData.amount)
            console.log('Root:', claimData.root)
            console.log('User:', claimData.user.toBase58())
        } catch (e) {
            // console.log(e)
            throw new Error('Claim data not found, please submit proof first')
        }

        await quoteClaimFee(proxyProgram, wallet.publicKey, taskArgs.env)
    })

task('sol:proxy:claim', 'Claim reward from Solana Proxy')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const [provider, wallet] = setupAnchor(taskArgs.env)
        const proxyProgram = getProxyProgram(taskArgs.env, provider)
        const claimDataPda = getClaimDataPda(proxyProgram.programId, wallet.publicKey)
        let claimData
        try {
            claimData = await proxyProgram.account.claimData.fetch(claimDataPda)
            console.log('Distribution ID:', claimData.distributionId)
            console.log('Cumulative amount:', claimData.amount)
            console.log('Root:', claimData.root)
            console.log('User:', claimData.user.toBase58())
        } catch (e) {
            // console.log(e)
            throw new Error('Claim data not found, please submit proof first')
        }

        const { lzTokenFee, nativeFee } = await quoteClaimFee(proxyProgram, wallet.publicKey, taskArgs.env)

        const tx = await sendClaimRequest(proxyProgram, provider, wallet, nativeFee, lzTokenFee, taskArgs.env)
        printTxLinks(taskArgs.env, tx)
    })
