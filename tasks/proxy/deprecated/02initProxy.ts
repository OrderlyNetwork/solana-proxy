import { task } from 'hardhat/config'
import { Program, workspace } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    getProxyConfigPda,
    setupAnchor,
    initProxy,
    printProxyConfig,
    getConfig,
    getDeployedProxyProgram,
    updateConfig,
} from '../utils'
import { SolanaProxy } from '../../../target/types/solana_proxy'
import { PublicKey } from '@solana/web3.js'
import { isAddress } from 'web3-validator'

interface InitProxyTaskArgs {
    occManagerAddress?: string
}

/// Calling this task will create and initialize the Proxy Config PDA and Proxy Escrow ATA and setup caller as the Proxy Owner.
/// It can be called only once.
/// Ownership can be then transferred by calling `proxy:transferOwnership` task.
/// It is supposed, that you already called the `proxy:updateConfig` task and next parameters are set in the config:
/// - proxyProgramId
/// - oftProgramId
/// - mintPda

task('proxy:init', 'Create and init Proxy Config PDA')
    .addParam(
        'occManagerAddress',
        'The OCC manager EVM address on the Orderly blockchain',
        undefined,
        devtoolsTypes.string
    )
    .setAction(async ({ occManagerAddress }: InitProxyTaskArgs) => {
        const config = getConfig()

        if (!config.proxyProgramId || !config.oftProgramId || !config.mintPda) {
            throw new Error('Please call proxy:updateConfig task first to set required parameters')
        }

        if (occManagerAddress) {
            if (!isAddress(occManagerAddress)) {
                throw new Error('Invalid OCC manager address')
            }
            config.occManagerAddress = occManagerAddress
            console.log(`OCC manager address updated in config: ${config.occManagerAddress}`)
        } else if (!config.occManagerAddress) {
            throw new Error(
                'Please either define occManagerAddress in the config or pass it as a parameter --occ-manager-address'
            )
        }

        const [provider] = setupAnchor('local')
        const proxyProgram = getDeployedProxyProgram('local', provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)

        try {
            const proxyConfig = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)
            // printProxyConfig('Proxy already initialized', proxyConfig)
        } catch {
            const oftProgramId = new PublicKey(config.oftProgramId)
            const mintPda = new PublicKey(config.mintPda)

            await initProxy(provider, proxyProgram, oftProgramId, mintPda, config.occManagerAddress)
            const proxyConfig = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)
            // printProxyConfig('Proxy Config initialized:', proxyConfig)

            updateConfig(config)
        }
    })
