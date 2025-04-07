import { PayloadType, OPTIONS_TO_SOLANA, LEDGER_OAPP_ACCOUNTS } from './constants'
// import { loadContractAddress, saveContractAddress, equalDVNs} from "./utils"
import { addressToBytes32, Options } from '@layerzerolabs/lz-v2-utilities'
import { DeployResult } from 'hardhat-deploy/dist/types'
import { task, types } from 'hardhat/config'
import { base58, hexlify } from 'ethers/lib/utils'
import {
    checkOrderlyNetwork,
    checkENV,
    getSolanaEid,
    getOrderlyEid,
    getLocalLzConfig,
    getLedgerOAppAddress,
    getProxyAccounts,
    getOrderlyNetwork,
    getSolanaNetwork,
    equalDVNs,
    getOccManagerAddress,
} from './utils'

import { getLzConfig } from './utils'
task('orderly:deploy', 'Deploys the contract to Orderly network')
    .addParam('env', 'The environment to deploy the contract', undefined, types.string)
    .addParam('contract', 'The contract to deploy', undefined, types.string)
    // .addFlag('preAddress', 'Predict the address of the contract before deployment')
    .setAction(async (taskArgs, hre) => {
        try {
            checkOrderlyNetwork(hre.network.name)
            const orderlyNetwork = hre.network.name
            checkENV(taskArgs.env)
            const ENV = taskArgs.env
            console.log(`Deploying ${taskArgs.contract} contract on ${hre.network.name} for ${taskArgs.env} env`)
            const { deploy } = hre.deployments
            const [signer] = await hre.ethers.getSigners()
            let proxy: boolean = false
            let lzEndpointAddress: string | undefined = ''
            let owner: string = ''
            let initArgs: any[] = []

            const contractName = taskArgs.contract

            if (contractName === 'LedgerOApp') {
                proxy = true
                lzEndpointAddress = getLocalLzConfig(orderlyNetwork).endpointAddress
                owner = signer.address
                console.log(`Owner: ${owner}`)
                initArgs = [lzEndpointAddress, owner]
            } else {
                return console.error('Invalid contract name')
            }

            const salt = hre.ethers.utils.id(process.env.ORDER_DEPLOYMENT_SALT + `${ENV}` || 'deterministicDeployment')
            const baseDeployArgs = {
                from: signer.address,
                log: true,
                deterministicDeployment: salt,
            }
            // deterministic deployment
            let deployedContract: DeployResult

            if (proxy) {
                deployedContract = await deploy(contractName, {
                    ...baseDeployArgs,
                    proxy: {
                        owner: owner,
                        proxyContract: 'UUPS',
                        execute: {
                            methodName: 'initialize',
                            args: initArgs,
                        },
                    },
                })
            } else {
                deployedContract = await deploy(contractName, {
                    ...baseDeployArgs,
                    args: initArgs,
                })
            }
            console.log(
                `${contractName} contract deployed to ${deployedContract.address} with tx hash ${deployedContract.transactionHash}`
            )
        } catch (error) {
            console.error(error)
        }
    })

task('orderly:upgrade', 'Upgrades the contract to a specific network')
    .addParam('env', 'The environment to upgrade the contract', undefined, types.string)
    .addParam('contract', 'The contract to upgrade', undefined, types.string)
    .setAction(async (taskArgs, hre) => {
        try {
            checkOrderlyNetwork(hre.network.name)
            const orderlyNetwork = hre.network.name
            checkENV(taskArgs.env)
            const ENV = taskArgs.env
            const contractName = taskArgs.contract
            console.log(`Running on ${hre.network.name} to upgrade ${contractName} for ${ENV} env`)
            const { deploy } = hre.deployments
            const [signer] = await hre.ethers.getSigners()
            let implAddress = ''
            const salt = hre.ethers.utils.id(process.env.ORDER_DEPLOYMENT_SALT + `${ENV}` || 'deterministicDeployment')
            if (contractName === 'LedgerOApp') {
                const baseDeployArgs = {
                    from: signer.address,
                    log: true,
                    deterministicDeployment: salt,
                }
                const contract = await deploy(contractName, {
                    ...baseDeployArgs,
                })
                implAddress = contract.address
                console.log(
                    `${contractName} implementation deployed to ${implAddress} with tx hash ${contract.transactionHash}`
                )
            } else {
                throw new Error(`Contract ${contractName} not found`)
            }

            // const contractAddress = await loadContractAddress(env, network, contractName) as string
            // const contract = await hre.ethers.getContractAt(contractName, contractAddress, signer)

            // // encoded data for function call during upgrade
            // const data = "0x"
            // const upgradeTx = await contract.upgradeToAndCall(implAddress, data)
            // console.log(`Upgrading contract ${contractName} to ${implAddress} with tx hash ${upgradeTx.hash}`)
        } catch (e) {
            console.log(`Error: ${e}`)
        }
    })

task('orderly:ledgeroapp:setpeer', 'Sets the peer contract for the contract')
    .addParam('env', 'The environment to send the transaction', undefined, types.string)
    // .addParam('contract', 'The contract to send the transaction', undefined, types.string)
    // .addParam('peer', 'The peer contract to set', undefined, types.string)
    .setAction(async (taskArgs, hre) => {
        checkOrderlyNetwork(hre.network.name)
        const orderlyNetwork = hre.network.name
        checkENV(taskArgs.env)
        const ENV = taskArgs.env
        const contractName = 'LedgerOApp'
        console.log(`Running on ${hre.network.name}`)
        const [signer] = await hre.ethers.getSigners()
        const contractAddress = getLedgerOAppAddress(ENV)
        const LedgerOApp = await hre.ethers.getContractAt(contractName, contractAddress, signer)
        const solEid = getSolanaEid(ENV)
        console.log(`Solana EID: ${solEid}`)
        let nonce = await signer.getTransactionCount()
        const solanaPeerAddress = hexlify(base58.decode(getProxyAccounts(ENV).configPda.toString()))
        const peerAddressOnContract = await LedgerOApp.peers(solEid)
        const isPeer = peerAddressOnContract == solanaPeerAddress
        if (!isPeer) {
            const setPeerTx = await LedgerOApp.setPeer(solEid, solanaPeerAddress, { nonce: nonce++ })
            await setPeerTx.wait()
            console.log(`Setting peer with tx hash ${setPeerTx.hash}`)
        } else {
            console.log(`Peer already set`)
        }

        const payloadType = PayloadType.ClaimUsdcRevenueBackward
        const options = OPTIONS_TO_SOLANA[ENV]
        const optionsOnContract = await LedgerOApp.payloadType2LzOptions(payloadType)
        if (optionsOnContract[0] != options.LZ_RECEIVE_GAS || optionsOnContract[1] != options.LZ_RECEIVE_VALUE) {
            const setOptionsTx = await LedgerOApp.setOptions(
                payloadType,
                options.LZ_RECEIVE_GAS,
                options.LZ_RECEIVE_VALUE,
                { nonce: nonce++ }
            )
            await setOptionsTx.wait()
            console.log(`Setting options with tx hash ${setOptionsTx.hash}`)
        } else {
            console.log(`Options already set`)
        }
    })

task('orderly:ledgeroapp:setOccManager', 'Sets the OCCManager for the contract')
    .addParam('env', 'The environment to send the transaction', undefined, types.string)
    .setAction(async (taskArgs, hre) => {
        checkOrderlyNetwork(hre.network.name)
        const orderlyNetwork = hre.network.name
        checkENV(taskArgs.env)
        const ENV = taskArgs.env
        const contractName = 'LedgerOApp'
        console.log(`Running on ${hre.network.name}`)
        const [signer] = await hre.ethers.getSigners()
        const contractAddress = getLedgerOAppAddress(ENV)
        const LedgerOApp = await hre.ethers.getContractAt(contractName, contractAddress, signer)
        const occManagerAddress = getOccManagerAddress(ENV)
        console.log(`OCCManager contract for ${ENV} is ${occManagerAddress}`)
        const txSetOccManager = await LedgerOApp.setOCCManagerAddr(occManagerAddress)
        await txSetOccManager.wait()
        console.log(`Setting OCCManager with tx hash ${txSetOccManager.hash}`)
    })

task('orderly:owner', 'Set the owner of SolConnector ')
    .addParam('env', 'The environment to operate', undefined, types.string)
    .addFlag('setOwner', 'Set the multisig as owner')
    .setAction(async (taskArgs, hre) => {
        checkOrderlyNetwork(hre.network.name)
        try {
            const orderlyNetwork = hre.network.name
            checkENV(taskArgs.env)
            const ENV = taskArgs.env
            const contractName = 'LedgerOApp'
            console.log(`Running on ${hre.network.name}`)
            const [signer] = await hre.ethers.getSigners()
            const contractAddress = getLedgerOAppAddress(ENV)
            const ledgerOApp = await hre.ethers.getContractAt(contractName, contractAddress, signer)

            const endpointV2Deployment = await hre.deployments.get('EndpointV2')
            const endpointV2 = await hre.ethers.getContractAt(
                endpointV2Deployment.abi,
                endpointV2Deployment.address,
                signer
            )

            const owner = await ledgerOApp.owner()
            const delegator = await endpointV2.delegates(ledgerOApp.address)

            console.log(`LedgerOApp Owner: ${owner}`)
            console.log(`LedgerOApp Delegator: ${delegator}`)

            if (taskArgs.setOwner) {
                const multiSig = LEDGER_OAPP_ACCOUNTS[taskArgs.env].multisig
                console.log(`MultiSig: ${multiSig}`)
                if (multiSig && owner !== multiSig) {
                    const txSetDelegator = await ledgerOApp.setDelegate(multiSig)
                    await txSetDelegator.wait()
                    console.log(`Set ledgerOApp Delegator to ${multiSig}`)
                    const txSetOwner = await ledgerOApp.transferOwnership(multiSig)
                    await txSetOwner.wait()
                    console.log(`Set ledgerOApp Owner to ${multiSig}`)
                } else {
                    console.log(`ledgerOApp Owner already set to ${multiSig} or not found`)
                }
            }
        } catch (e) {
            console.log(`Error: ${e}`)
        }
    })

task('orderly:getconfig', 'Gets the configuration of the contract')
    .addParam('env', 'The environment to deploy the OFT contract', undefined, types.string)
    .addFlag('setConfig', 'Set the configuration of OFT contracts for different networks')
    .addFlag('forceSet', 'Force set the configuration of OFT contracts for different networks')
    .addFlag('multisig', 'Get the proposal for multisig')
    .setAction(async (taskArgs, hre) => {
        const CONFIG_TYPE_EXECUTOR = 1
        const CONFIG_TYPE_ULN = 2
        const EXECUTOR_CONFIG_STRUCT = 'tuple(uint32 maxMessageSize, address executorAddress)'
        // const EXECUTOR_CONFIG_STRUCT = ["uint32","address"]
        const ULN_CONFIG_STRUCT =
            'tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)'
        // const ULN_CONFIG_STRUCT = ["uint64","uint8","uint8","uint8","address[]","address[]"]

        try {
            checkOrderlyNetwork(hre.network.name)
            const orderlyNetwork = getOrderlyNetwork(taskArgs.env)
            checkENV(taskArgs.env)
            const ENV = taskArgs.env
            const solanaNetwork = getSolanaNetwork(ENV)
            const endpointV2Deployment = await hre.deployments.get('EndpointV2')
            const [signer] = await hre.ethers.getSigners()
            const endpointV2 = await hre.ethers.getContractAt(
                endpointV2Deployment.abi,
                endpointV2Deployment.address,
                signer
            )
            const contractName = 'LedgerOApp'
            const contractAddress = getLedgerOAppAddress(ENV)
            const ledgerOApp = await hre.ethers.getContractAt(contractName, contractAddress, signer)
            const lzLibConfig = getLocalLzConfig(orderlyNetwork)
            let solanaLzConfig,
                solanaEid,
                defaultSendLib,
                defaultReceiveLib,
                onchainSendLibConfigExecutor,
                onchainSendLibConfigULN,
                onchainReceiveLibConfigULN,
                lzSendConfig,
                lzReceiveConfig
            let rawSendLibExecutor, rawSendLibULN, rawReceiveLibULN, setSendLibExecutor, setSendLibULN, setReceiveLibULN
            let receiveLibConfigULNArray = []
            let sendLibConfigExecutorULNArray = []
            solanaLzConfig = getLocalLzConfig(solanaNetwork)
            solanaEid = solanaLzConfig['endpointId']
            defaultSendLib = await endpointV2.defaultSendLibrary(solanaEid)
            defaultReceiveLib = await endpointV2.defaultReceiveLibrary(solanaEid)
            onchainSendLibConfigExecutor = await endpointV2.getConfig(
                ledgerOApp.address,
                defaultSendLib,
                solanaEid,
                CONFIG_TYPE_EXECUTOR
            )
            onchainSendLibConfigULN = await endpointV2.getConfig(
                ledgerOApp.address,
                defaultSendLib,
                solanaEid,
                CONFIG_TYPE_ULN
            )
            onchainReceiveLibConfigULN = await endpointV2.getConfig(
                ledgerOApp.address,
                defaultReceiveLib,
                solanaEid,
                CONFIG_TYPE_ULN
            )
            const [decodeSendLibConfigExecutor] = hre.ethers.utils.defaultAbiCoder.decode(
                [EXECUTOR_CONFIG_STRUCT],
                onchainSendLibConfigExecutor
            )
            const [decodeSendLibConfigULN] = hre.ethers.utils.defaultAbiCoder.decode(
                [ULN_CONFIG_STRUCT],
                onchainSendLibConfigULN
            )
            const [decodeReceiveLibConfigULN] = hre.ethers.utils.defaultAbiCoder.decode(
                [ULN_CONFIG_STRUCT],
                onchainReceiveLibConfigULN
            )
            lzSendConfig = lzLibConfig.sendLibConfig
            lzReceiveConfig = lzLibConfig.receiveLibConfig
            console.log(`=================Print Config for pathway to ${solanaNetwork}===================`)
            console.log(`Default SendLib: ${defaultSendLib}`)
            console.log(
                `Onchain SendLibConfigExecutor: \n maxMessageSize: ${decodeSendLibConfigExecutor[0]},\n executor: ${decodeSendLibConfigExecutor[1]}`
            )
            console.log(
                `Onchain SendLibConfigULN: \n confirmations: ${decodeSendLibConfigULN[0]}, \n requiredDVNCount: ${decodeSendLibConfigULN[1]}, \n optionalDVNCount: ${decodeSendLibConfigULN[2]}, \n optionalDVNThreshold: ${decodeSendLibConfigULN[3]}, \n requiredDVNs: ${decodeSendLibConfigULN[4]}, \n optionalDVNs: ${decodeSendLibConfigULN[5]} \n`
            )

            console.log(`Default ReceiveLib: ${defaultReceiveLib}`)
            console.log(
                `Onchain ReceiveLibConfigULN: \n confirmations: ${decodeReceiveLibConfigULN[0]}, \n requiredDVNCount: ${decodeReceiveLibConfigULN[1]}, \n optionalDVNCount: ${decodeReceiveLibConfigULN[2]}, \n optionalDVNThreshold: ${decodeReceiveLibConfigULN[3]}, \n requiredDVNs: ${decodeReceiveLibConfigULN[4]}, \n optionalDVNs: ${decodeReceiveLibConfigULN[5]} \n`
            )

            let nonce = await signer.getTransactionCount()
            if (taskArgs.setConfig) {
                const isDefaultSendLib = await endpointV2.isDefaultSendLibrary(ledgerOApp.address, solanaEid)
                console.log(`Is Default SendLib: ${isDefaultSendLib}`)
                if (isDefaultSendLib) {
                    const txSetSendLib = await endpointV2.setSendLibrary(
                        ledgerOApp.address,
                        solanaEid,
                        defaultSendLib,
                        { nonce: nonce++ }
                    )
                    await txSetSendLib.wait()
                    console.log(`✅ Set SendLib for ${solanaNetwork}`)
                } else {
                    console.log(`👌 SendLib already set for ${solanaNetwork}`)
                }

                const receiveLibOnContract = await endpointV2.getReceiveLibrary(ledgerOApp.address, solanaEid)
                const expiryBlocks = 0
                if (receiveLibOnContract.isDefault == true) {
                    const txSetReceiveLib = await endpointV2.setReceiveLibrary(
                        ledgerOApp.address,
                        solanaEid,
                        defaultReceiveLib,
                        expiryBlocks,
                        { nonce: nonce++ }
                    )
                    await txSetReceiveLib.wait()
                    console.log(`✅ Set ReceiveLib for ${solanaNetwork}`)
                } else {
                    console.log(`👌 ReceiveLib already set for ${solanaNetwork}`)
                }
            }

            // create new arreys to set config
            rawSendLibExecutor = [...(decodeSendLibConfigExecutor || [])]
            // console.log(rawSendLibExecutor)
            rawSendLibULN = [...(decodeSendLibConfigULN || [])]
            rawReceiveLibULN = [...(decodeReceiveLibConfigULN || [])]

            // console.log(rawSendLibULN[4])
            if (!equalDVNs(rawSendLibULN[4], lzLibConfig.sendLibConfig?.ulnConfig.requiredDVNs!)) {
                console.log(`🚨 The onchain Send DVNs on chain are not the same as defined on config file`)
                rawSendLibULN[4] = lzLibConfig.sendLibConfig?.ulnConfig.requiredDVNs
                rawSendLibULN[1] = lzLibConfig.sendLibConfig?.ulnConfig.requiredDVNs.length
                setSendLibULN = true
                // console.log(rawSendLibULN)
                const encodeSendLibConfigExecutor = hre.ethers.utils.defaultAbiCoder.encode(
                    [EXECUTOR_CONFIG_STRUCT],
                    [rawSendLibExecutor]
                )
                sendLibConfigExecutorULNArray.push([solanaEid, CONFIG_TYPE_EXECUTOR, encodeSendLibConfigExecutor])
                const encodeSendLibConfigULN = hre.ethers.utils.defaultAbiCoder.encode(
                    [ULN_CONFIG_STRUCT],
                    [rawSendLibULN]
                )
                sendLibConfigExecutorULNArray.push([solanaEid, CONFIG_TYPE_ULN, encodeSendLibConfigULN])
            } else {
                console.log(`👌 The onchain Send DVNs on chain are the same as defined on config file`)
            }

            // console.log(decodeReceiveLibConfigULN[4])
            if (!equalDVNs(decodeReceiveLibConfigULN[4], lzLibConfig.receiveLibConfig?.ulnConfig.requiredDVNs!)) {
                console.log(`🚨 The onchain Receive DVNs on chain are not the same as defined on config file`)
                rawReceiveLibULN[4] = lzLibConfig.receiveLibConfig?.ulnConfig.requiredDVNs
                rawReceiveLibULN[1] = lzLibConfig.receiveLibConfig?.ulnConfig.requiredDVNs.length
                setReceiveLibULN = true
                // console.log(rawReceiveLibULN)
                const encodeRceiveLibConfigULN = hre.ethers.utils.defaultAbiCoder.encode(
                    [ULN_CONFIG_STRUCT],
                    [rawReceiveLibULN]
                )
                receiveLibConfigULNArray.push([solanaEid, CONFIG_TYPE_ULN, encodeRceiveLibConfigULN])
            } else {
                console.log(`👌 The onchain Receive DVNs on chain are the same as defined on config file`)
            }

            if (taskArgs.setConfig) {
                if (setSendLibULN || taskArgs.forceSet) {
                    console.log('=====🚨 Set SendLib config for all above listed networks=====')
                    const txSetSendConfig = await endpointV2.setConfig(
                        ledgerOApp.address,
                        defaultSendLib,
                        sendLibConfigExecutorULNArray,
                        { nonce: nonce++ }
                    )
                    await txSetSendConfig.wait()
                    console.log(`✅ Set SendLib config on ${orderlyNetwork}`)
                } else {
                    console.log(`👌 SendLib config already set on ${orderlyNetwork}`)
                }
                if (setReceiveLibULN || taskArgs.forceSet) {
                    console.log('=====🚨 Set ReceivedLib config for all above listed networks=====')
                    const txSetULNConfig = await endpointV2.setConfig(
                        ledgerOApp.address,
                        defaultReceiveLib,
                        receiveLibConfigULNArray,
                        { nonce: nonce++ }
                    )
                    await txSetULNConfig.wait()
                    console.log(`✅ Set ReceiveLib config on ${orderlyNetwork}`)
                } else {
                    console.log(`👌 ReceiveLib config already set on ${orderlyNetwork}`)
                }
            }

            const localContract = await hre.ethers.getContractAt(contractName, ledgerOApp.address, signer)
            const solEid = getSolanaEid(ENV)
            const solPeer = await localContract.peers(solEid)
            const [gas, value] = await localContract.payloadType2LzOptions(14) // 14: ClaimUsdcRevenueBackward
            const owner = await localContract.owner()
            const endpoint = await localContract.endpoint()
            const occManagerAddr = await localContract.occManagerAddr()
            const delegator = await endpointV2.delegates(ledgerOApp.address)
            console.log(`=================Print SolConnector Information===================`)
            console.log(`Solana EID: ${solEid}`)
            console.log(`ClaimUsdcRevenueBackward Msg Gas: ${gas}, Withdraw Msg Value: ${value}`)
            console.log(`Solana Peer: ${base58.encode(solPeer)}`)
            console.log(`Endpoint address: ${endpoint}`)
            console.log(`occManagerAddr address: ${occManagerAddr}`)
            console.log(`LedgerOApp Owner: ${owner}`)
            console.log(`LedgerOApp Delegator: ${delegator}`)
        } catch (error) {
            console.error(error)
        }
    })
