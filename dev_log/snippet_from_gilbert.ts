import { AccountMeta, createNoopSigner, publicKey } from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import * as web3 from '@solana/web3.js'

import { MainnetV2EndpointId } from '@layerzerolabs/lz-definitions'
import { EventPDADeriver, SendHelper } from '@layerzerolabs/lz-solana-sdk-v2'
import { hexlify } from '@layerzerolabs/lz-utilities'
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'
import { OftPDA, accounts, instructions, oft } from '@layerzerolabs/oft-v2-solana-sdk'

const OFT_PROGRAM_ID = publicKey('xxxx')

async function main(): Promise<AccountMeta[]> {
    const connection = new web3.Connection('http://', 'confirmed')
    const umi = createUmi(connection)

    const deriver = new OftPDA(OFT_PROGRAM_ID)
    const dstEid = MainnetV2EndpointId.BSC_V2_MAINNET
    const wallet = new web3.Keypair() // please replace with a real wallet

    const tokenMint = publicKey('0xDead') // please replace with a real token mint
    const tokenEscrow = publicKey('0xDead') // please replace with a real token escrow
    const tokenSource = await getAssociatedTokenAddress(toWeb3JsPublicKey(tokenMint), wallet.publicKey)

    const [oftStore] = deriver.oftStore(tokenEscrow)
    const [peer] = deriver.peer(oftStore, dstEid)
    const peerInfo = await accounts.fetchPeerConfig(umi, peer)

    const [eventAuthorityPDA] = new EventPDADeriver(toWeb3JsPublicKey(OFT_PROGRAM_ID)).eventAuthority()
    const tokenProgram = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)
    const helper = new SendHelper()

    const txBuilder = instructions.send(
        { programs: oft.createOFTProgramRepo(OFT_PROGRAM_ID) },
        {
            signer: createNoopSigner(fromWeb3JsPublicKey(wallet.publicKey)),
            peer: peer,
            oftStore: oftStore,
            tokenSource: fromWeb3JsPublicKey(tokenSource),
            tokenEscrow: tokenEscrow,
            tokenMint: tokenMint,
            tokenProgram: tokenProgram,
            eventAuthority: fromWeb3JsPublicKey(eventAuthorityPDA),
            program: OFT_PROGRAM_ID,

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
                connection,
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

    return [
        {
            pubkey: ix.instruction.programId,
            isSigner: false,
            isWritable: false,
        },
        ...ix.instruction.keys,
    ]
}