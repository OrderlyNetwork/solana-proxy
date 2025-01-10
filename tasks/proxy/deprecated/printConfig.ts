import { task } from 'hardhat/config'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { OftPDA, accounts, oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { EventPDADeriver } from '@layerzerolabs/lz-solana-sdk-v2'
import { publicKey as metaplexPublicKey } from '@metaplex-foundation/umi'
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
    getProxyConfigPda,
    setupAnchor,
    getConfig,
    getDeployedProxyProgram,
    getOrderlyEid,
    bytes32ToEvmAddress,
} from '../utils'

task('proxy:printConfig', 'Print Proxy and related PDA').setAction(async () => {
    const [provider, wallet] = setupAnchor()
    const umi = createUmi(provider.connection)
    const config = getConfig()

    const [proxyProgramId, proxyProgram] = getDeployedProxyProgram(provider)
    console.log('Proxy program ID:        ', config.proxyProgramId)

    const proxyConfigPda = getProxyConfigPda(proxyProgramId)
    console.log('Proxy Config PDA:     ', proxyConfigPda.toBase58())
    const proxyConfigPdaData = await proxyProgram.account.proxyConfig.fetch(proxyConfigPda)
    console.log('  - owner:               ', proxyConfigPdaData.owner.toBase58())
    console.log('  - solChainId:          ', proxyConfigPdaData.solChainId.toString())
    console.log('  - dstEid:              ', proxyConfigPdaData.dstEid.toString())
    console.log('  - nonce:               ', proxyConfigPdaData.nonce.toString())

    const oftProgramId = config.oftProgramId
    console.log('OFT program ID:          ', oftProgramId)
    console.log('  - mint:                ', config.oftMint)
    console.log('  - escrow ATA:          ', config.oftEscrowAta)

    const deriver = new OftPDA(metaplexPublicKey(oftProgramId))
    const [oftStore] = deriver.oftStore(metaplexPublicKey(config.oftEscrowAta))
    console.log('  - store PDA:           ', toWeb3JsPublicKey(oftStore).toBase58())

    const dstEid = getOrderlyEid()
    const [peer] = deriver.peer(oftStore, dstEid)
    console.log('  - peer PDA:            ', toWeb3JsPublicKey(peer).toBase58())

    const peerInfo = await accounts.fetchPeerConfig(umi, peer)
    console.log('    - EVM peer addr:     ', bytes32ToEvmAddress(peerInfo.peerAddress))

    const tokenSource = await getAssociatedTokenAddressSync(new PublicKey(config.oftMint), wallet.publicKey)
    console.log('  - user ATA:            ', tokenSource.toBase58())

    const [eventAuthorityPDA] = new EventPDADeriver(new PublicKey(oftProgramId)).eventAuthority()
    console.log('  - event authority PDA: ', eventAuthorityPDA.toBase58())

    const endpointConfig = await oft.getEndpointConfig(umi.rpc, oftStore, dstEid)
    console.log('  - endpoint config:     ', endpointConfig)
})
