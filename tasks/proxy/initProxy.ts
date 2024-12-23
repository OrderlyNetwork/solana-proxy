import { task } from 'hardhat/config'
import { Program, workspace } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { getProxyAuthorityPda, setAnchor, initProxy, printProxyAuthority } from './utils'
import { SolanaProxy } from '../../target/types/solana_proxy'

interface InitProxyTaskArgs {
    /**
     * The nonce of the proxy authority.
     */
    nonce: number
    /**
     * Force reinitialization of the proxy authority.
     */
    force: boolean
}

task('proxy:init', 'Create and init Proxy Authority PDA')
    .addParam('nonce', 'The nonce of the proxy authority', 0, devtoolsTypes.int)
    .addParam('force', 'Force reinitialization of the proxy authority', false, devtoolsTypes.boolean)
    .setAction(async ({ nonce, force }: InitProxyTaskArgs) => {
        const [provider] = setAnchor();
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
            await initProxy(provider, proxyProgram, nonce);
            const proxyAuthority = await proxyProgram.account.proxyAuthority.fetch(proxyAuthorityPda);
            printProxyAuthority("Proxy Authority initialized:", proxyAuthority);
        }
    })
