import { task } from 'hardhat/config'
import { Program, workspace } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { getProxyAuthorityPda, setupAnchor, initProxy, printProxyAuthority } from './utils'
import { SolanaProxy } from '../../target/types/solana_proxy'
import { PublicKey } from '@solana/web3.js'

interface InitProxyTaskArgs {
    /**
     * The nonce of the proxy authority.
     */
    nonce: number
    /**
     * The OFT program ID, Proxy will connect to.
     */
    oftProgramId: string
    /**
     * Force reinitialization of the proxy authority.
     */
    force: boolean
}

task('proxy:init', 'Create and init Proxy Authority PDA')
    .addParam('nonce', 'The nonce of the proxy authority', 0, devtoolsTypes.int)
    .addParam('oftProgramId', 'The OFT program ID, Proxy will connect to', undefined, devtoolsTypes.string)
    .addFlag('force', 'Force reinitialization of the proxy authority')
    .setAction(async ({ nonce, oftProgramId, force }: InitProxyTaskArgs) => {
        const [provider] = setupAnchor();
        const proxyProgram = workspace.SolanaProxy as Program<SolanaProxy>;
        const proxyAuthorityPda = getProxyAuthorityPda(proxyProgram.programId);

        let should_init = force;
        try {
            const proxyAuthority = await proxyProgram.account.proxyAuthority.fetch(proxyAuthorityPda);
            printProxyAuthority("Proxy Authority already initialized", proxyAuthority);
            if (force) {
                console.log("Force reinitialization...");
            } else {
                console.log("You can force reinitialization by passing --force flag.");
            }
        } catch {
            should_init = true;
        }

        if (should_init) {
            if (!oftProgramId) {
                throw new Error("OFT Program ID is required for initialization");
            }
            const oftProgram = new PublicKey(oftProgramId);
            await initProxy(provider, proxyProgram, oftProgram, nonce);
            const proxyAuthority = await proxyProgram.account.proxyAuthority.fetch(proxyAuthorityPda);
            printProxyAuthority("Proxy Authority initialized:", proxyAuthority);
        }
    })
