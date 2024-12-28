import { AnchorProvider, Program, Wallet, setProvider, workspace } from '@coral-xyz/anchor'
import { SolanaProxy } from '../../target/types/solana_proxy'
import { testInitProxy } from './utils/proxy'

describe('solana-proxy', () => {
    const jestConsole = console
    global.console = require('console')

    process.env.ENV = 'LOCAL'
    const provider = AnchorProvider.local(undefined, { commitment: 'confirmed', preflightCommitment: 'confirmed' })
    const wallet = provider.wallet as Wallet
    const connection = provider.connection
    setProvider(provider)

    const proxyProgram = workspace.SolanaProxy as Program<SolanaProxy>

    it('Initialization success', async () => {
        await testInitProxy(provider, proxyProgram)

        // Second initialization should fail
        expect(testInitProxy(provider, proxyProgram)).rejects
    })
})
