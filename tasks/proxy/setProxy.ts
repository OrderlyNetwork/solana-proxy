import { task } from 'hardhat/config'
import { Program, workspace, BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    getProxyConfigPda,
    getLzReceiveTypesPda,
    getPeerPda,
    getPeerAddress,
    setupAnchor,
    printProxyConfig,
    printPeerPda,
    getConfig,
    getDeployedProxyProgram,
    updateConfig,
    getEndpoint,
    getUsdcTokenAccount,
    getOrderlyEid,
    getSolanaChainId,
    getTokenATA,
    createAndSendV0Tx,
    getSendLibProgramId,
    getReceiveLibProgramId,
    getOptions,
    delay,
} from './utils'
import { SolanaProxy } from '../../target/types/solana_proxy'
import { PublicKey, AccountMeta } from '@solana/web3.js'
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
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { PEER_ADDRESS } from './constants'

task('sol:proxy:init', 'Create and init Proxy Config PDA')
    .addParam('env', 'The environment to run the task', undefined, devtoolsTypes.string)
    .setAction(async (taskArgs, hre) => {
        const config = getConfig()

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
            console.log(e)
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

task('sol:proxy:set', 'Set Peer for Solana Proxy')
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
                    send: Options.newOptions()
                        .addExecutorLzReceiveOption(options.LZ_RECEIVE_GAS, options.LZ_RECEIVE_VALUE)
                        .toBytes(),
                    sendAndCall: Options.newOptions()
                        .addExecutorLzReceiveOption(options.LZ_RECEIVE_GAS, options.LZ_RECEIVE_VALUE)
                        .addExecutorComposeOption(0, options.LZ_COMPOSE_GAS, options.LZ_COMPOSE_VALUE)
                        .toBytes(),
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

        const ix = wrappedIx.map((wrapped) => toWeb3JsInstruction(wrapped.instruction))
        const tx = await createAndSendV0Tx(ix, provider, wallet)
        console.log('Tx to set Peer for Solana Proxy:', tx)
        await delay(taskArgs.env)
    })
