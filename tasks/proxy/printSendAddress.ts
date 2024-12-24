import { task } from 'hardhat/config'
import { PublicKey, Keypair } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { OftPDA, accounts, oft, instructions } from '@layerzerolabs/oft-v2-solana-sdk'
import { EventPDADeriver, SendHelper } from '@layerzerolabs/lz-solana-sdk-v2'
import { publicKey as metaplexPublicKey, createNoopSigner } from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { setAnchor, getConfig, getOrderlyEid } from './utils'
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'
import { hexlify } from '@layerzerolabs/lz-utilities'

task('proxy:printSendAddress', 'Print address, needed for OFT send command')
    .setAction(async () => {
        const [provider, wallet] = setAnchor();
        const umi = createUmi(provider.connection)
        const config = getConfig();

        const oftProgramIdStr = config.oftProgramId;
        const oftProgramId = metaplexPublicKey(oftProgramIdStr)
        const deriver = new OftPDA(oftProgramId);
        const dstEid = getOrderlyEid();

        const tokenMint = metaplexPublicKey(config.oftMint) // please replace with a real token mint
        const tokenEscrow = metaplexPublicKey(config.oftEscrow) // please replace with a real token escrow
        const tokenSource = await getAssociatedTokenAddress(toWeb3JsPublicKey(tokenMint), wallet.publicKey)

        const [oftStore] = deriver.oftStore(tokenEscrow)
        const [peer] = deriver.peer(oftStore, dstEid)
        const peerInfo = await accounts.fetchPeerConfig(umi, peer)

        const [eventAuthorityPDA] = new EventPDADeriver(new PublicKey(oftProgramIdStr)).eventAuthority()
        const tokenProgram = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)
        const helper = new SendHelper()

        const txBuilder = instructions.send(
            { programs: oft.createOFTProgramRepo(oftProgramId) },
            {
                signer: createNoopSigner(fromWeb3JsPublicKey(wallet.publicKey)),
                peer: peer,
                oftStore: oftStore,
                tokenSource: fromWeb3JsPublicKey(tokenSource),
                tokenEscrow: tokenEscrow,
                tokenMint: tokenMint,
                tokenProgram: tokenProgram,
                eventAuthority: fromWeb3JsPublicKey(eventAuthorityPDA),
                program: oftProgramId,

                // The following parameters can be any value and will not affect obtaining the accounts.
                dstEid: dstEid,
                to: addressToBytes32('0xDead'),
                amountLd: 1n,
                minAmountLd: 1n,
                options: new Uint8Array(),
                composeMsg: null,
                nativeFee: 0n,
                lzTokenFee: 0n,
            }
        )

        // Get remaining accounts from msgLib(simple_msgLib or uln)
        const ix = txBuilder.addRemainingAccounts(
            (
                await helper.getSendAccounts(
                    provider.connection,
                    wallet.publicKey,
                    toWeb3JsPublicKey(oftStore),
                    dstEid,
                    hexlify(peerInfo.peerAddress)
                )
            ).map((acc) => {
                return {
                    pubkey: fromWeb3JsPublicKey(acc.pubkey),
                    isSigner: acc.isSigner,
                    isWritable: acc.isWritable,
                }
            })
        ).items[0]

        console.log([
            {
                pubkey: ix.instruction.programId,
                isSigner: false,
                isWritable: false,
            },
            ...ix.instruction.keys,
        ])
    })
