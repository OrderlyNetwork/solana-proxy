import {
    CreateV1InstructionAccounts,
    CreateV1InstructionArgs,
    TokenStandard,
    createV1,
} from '@metaplex-foundation/mpl-token-metadata';
import {
    createSignerFromKeypair,
    percentAmount,
    transactionBuilder,
} from '@metaplex-foundation/umi';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { PublicKey, Keypair } from '@solana/web3.js';
import { EVENT_SEED, LZ_RECEIVE_TYPES_SEED } from '@layerzerolabs/lz-solana-sdk-v2';
import { OFT_SEED } from '@layerzerolabs/oft-v2-solana-sdk';
import { deriveConnection } from './index';
import { TestnetV2EndpointId } from '@layerzerolabs/lz-definitions';
import { addComputeUnitInstructions, deriveKeys, getExplorerTxLink } from '../../../tasks/solana';
import { assertAccountInitialized } from '../../../tasks/solana/utils';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { EndpointId } from '@layerzerolabs/lz-definitions';

const OFT_NAME = "Orderly Network";
const SYMBOL = "ORDER";
const DECIMALS = 10;
const URI = "";

export const getOftPda = (oftProgramId: PublicKey, endpointProgramId: PublicKey, escrowPubKey: PublicKey, eid: number) => {
    const escrow = Keypair.generate();

    // const oftPdaDeriver = new OftPDADeriver(oftProgramId)
    // const [pdaDeriverConfig] = oftPdaDeriver.config()
    // const [oftStorePda] = oftPdaDeriver.oftConfig(escrow.publicKey)
    // const [lzReceiveTypesAccountsPda] = oftPdaDeriver.lzReceiveTypesAccounts(oftStorePda)
    // const [enforcedOptionsPda] = oftPdaDeriver.enforcedOptions(oftStorePda, eid)
    // const [peerPda] = oftPdaDeriver.peer(oftStorePda, eid)

    const [oftStorePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(OFT_SEED), escrow.publicKey.toBuffer()],
        oftProgramId
    );

    const [lzReceiveTypesAccountsPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(LZ_RECEIVE_TYPES_SEED), oftStorePda.toBuffer()],
        oftProgramId
    );

    // Check that keys are correct
    // assert(foundoftStorePda.equals(oftStorePda), "Oft Config PDA not equal")
    // assert(foundLzReceiveTypesAccountsPda.equals(lzReceiveTypesAccountsPda), "LZ Receive Types Accounts PDA not equal")

    const [oappRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("OApp"), oftStorePda.toBuffer()],
        endpointProgramId
    );

    const [eventAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(EVENT_SEED)],
        endpointProgramId
    );

    return {
        oftStorePda,
        lzReceiveTypesAccountsPda,
        // enforcedOptionsPda,
        // peerPda,
        oappRegistryPda,
        eventAuthorityPda
    }
}

export const initOft = async (provider: AnchorProvider, oftProgramId: PublicKey, endpointProgramId: PublicKey) => {
    const wallet = provider.wallet as Wallet
    const connection = provider.connection
    const eid = TestnetV2EndpointId.ORDERLY_V2_TESTNET
    const mintKeyPair = Keypair.generate();

    const { umi, umiWalletKeyPair, umiWalletSigner } = await deriveConnection(provider)
    const { programId, lockBox, escrowPK, oftStorePda, eddsa } = deriveKeys(oftProgramId.toBase58())
    const mint = createSignerFromKeypair(umi, eddsa.generateKeypair())

    const balanceBefore = await connection.getBalance(wallet.publicKey);
    console.log(`balanceBefore: ${balanceBefore}`)
    await connection.requestAirdrop(toWeb3JsPublicKey(umi.payer.publicKey), 1e12)
    const balanceAfter = await connection.getBalance(wallet.publicKey);
    console.log(`balanceAfter: ${balanceAfter}`)

    const createV1Args: CreateV1InstructionAccounts & CreateV1InstructionArgs = {
        mint,
        name: OFT_NAME,
        symbol: SYMBOL,
        decimals: DECIMALS,
        uri: URI,
        isMutable: true,
        sellerFeeBasisPoints: percentAmount(0),
        authority: umiWalletSigner, // authority is transferred later
        tokenStandard: TokenStandard.Fungible,
    }
    let txBuilder = transactionBuilder().add(createV1(umi, createV1Args))
    // txBuilder = await addComputeUnitInstructions(
    //     connection,
    //     umi,
    //     EndpointId.SOLANA_V2_TESTNET,
    //     txBuilder,
    //     umiWalletSigner,
    //     4
    // )
    const createTokenTx = await txBuilder.sendAndConfirm(umi)
    await assertAccountInitialized(connection, toWeb3JsPublicKey(mint.publicKey))
    console.log(`createTokenTx: ${getExplorerTxLink(bs58.encode(createTokenTx.signature), true)}`)
    console.log(`mint: ${mint.publicKey.toString()}`)
}