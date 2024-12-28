import { AnchorProvider, Program, Wallet, setProvider, workspace } from '@coral-xyz/anchor'
import { Oft } from '../../target/types/oft'
import { Endpoint } from '../../target/types/endpoint'
import { getOftPda, initOft } from './utils/oft'
import { Keypair } from '@solana/web3.js'
import { TestnetV2EndpointId } from '@layerzerolabs/lz-definitions'

describe('🗂️Test Solana OFT', () => {
    const jestConsole = console
    global.console = require('console')

    process.env.ENV = 'LOCAL'
    console.log('Get test environment and pdas')
    const provider = AnchorProvider.local(undefined, { commitment: 'confirmed', preflightCommitment: 'confirmed' })
    const wallet = provider.wallet as Wallet
    const connection = provider.connection
    setProvider(provider)

    const oftProgram = workspace.Oft as Program<Oft>
    const endpointProgram = workspace.endpoint as Program<Endpoint>

    const mintKeyPair = Keypair.generate()
    const eid = TestnetV2EndpointId.ORDERLY_V2_TESTNET

    beforeAll(async () => {
        // await initOft(provider, oftProgram.programId, endpointProgram.programId)
        console.log('✅ Init Oft')
    })

    it('🚀Get OFT version', async () => {
        const tx = await oftProgram.methods.oftVersion().rpc()
        console.log('Your transaction signature', tx)
    })
})
