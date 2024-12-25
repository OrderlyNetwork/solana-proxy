import { TransactionInstruction, VersionedTransaction, TransactionMessage, PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN, Program, setProvider, Wallet } from "@coral-xyz/anchor";
import { ethers } from 'ethers';
import { DEV_PROXY_PROGRAM_ID, MAIN_PROXY_PROGRAM_ID, PROXY_AUTHORITY_SEED, QA_PROXY_PROGRAM_ID, STAGING_PROXY_PROGRAM_ID } from "./constants";
import { IDL, SolanaProxy } from "../../target/types/solana_proxy";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import dev_config from "../../config/dev.json";
import test_config from "../../config/test.json";
import qa_config from "../../config/qa.json";
import staging_config from "../../config/staging.json";
import main_config from "../../config/main.json";
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { OftPDA, accounts, oft, instructions } from '@layerzerolabs/oft-v2-solana-sdk';
import { EventPDADeriver, SendHelper } from '@layerzerolabs/lz-solana-sdk-v2';
import { publicKey as metaplexPublicKey, createNoopSigner } from '@metaplex-foundation/umi';
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities';
import { hexlify } from '@layerzerolabs/lz-utilities';
import { assert } from "console";
import { readFileSync } from "fs";
import { join } from "path";

const VALID_ENVS = ["LOCAL", "DEV", "QA", "STAGING", "MAIN"];
const LOCALHOST_RPC_URL = "http://localhost:8899";
const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const SOLANA_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

export function getEnv(): String {
    let ENV = process.env.ENV;
    if (!ENV) {
        throw new Error("Please set ENV variable in the .env file (can be LOCAL, DEV, QA, STAGING, MAIN)");
    }

    ENV = ENV.trim().toUpperCase();

    if (!VALID_ENVS.includes(ENV)) {
        throw new Error("Invalid ENV variable. It can be LOCAL, DEV, QA, STAGING, MAIN");
    }

    return ENV;
}

export function setupAnchor(): [AnchorProvider, Wallet, string] {
    const ENV = getEnv();

    let ANCHOR_PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL;
    if (!ANCHOR_PROVIDER_URL) {
        if (ENV === "LOCAL") {
            process.env.RPC_URL_SOLANA_TESTNET = LOCALHOST_RPC_URL;
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA_TESTNET;
        } else if (ENV === "MAIN") {
            process.env.RPC_URL_SOLANA = SOLANA_MAINNET_RPC_URL;
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA;
        } else {
            process.env.RPC_URL_SOLANA_TESTNET = SOLANA_DEVNET_RPC_URL;
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA_TESTNET;
        }
    }
    const provider = AnchorProvider.env();
    setProvider(provider);
    const rpc = provider.connection.rpcEndpoint;
    console.log(`Running on ${ENV} environment. Rpc: ${rpc}`)
    const wallet = provider.wallet as Wallet;
    return [provider, wallet, rpc];
}

export function getSolanaEid(): number {
    if (getEnv() === "MAIN") {
        return EndpointId.SOLANA_V2_MAINNET;
    }
    return EndpointId.SOLANA_V2_TESTNET;
}

export function getOrderlyEid(): number {
    if (getEnv() === "MAIN") {
        return EndpointId.ORDERLY_V2_MAINNET;
    }
    return EndpointId.ORDERLY_V2_TESTNET;
}

export function getConfigPath() {
    const ENV = getEnv();
    return join(__dirname, `../../config/${ENV.toLowerCase()}.json`);
}

export function getConfig(): any {
    const configPath = getConfigPath();
    try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        return config;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to load config file at ${configPath}: ${error.message}`);
        } else {
            throw new Error(`Failed to load config file at ${configPath}: Unknown error`);
        }
    }
}

export function getDeployedProxyProgram(provider: AnchorProvider): [PublicKey, Program<SolanaProxy>] {
    const proxyProgramIdStr = getConfig().proxyProgramId;
    const proxyProgram = new Program<SolanaProxy>(IDL, proxyProgramIdStr, provider);
    return [new PublicKey(proxyProgramIdStr), proxyProgram];
}

export function stringToBytes32(str: string): number[] {
    const bigNumber = ethers.BigNumber.from(str);
    const bytes32 = ethers.utils.zeroPad(bigNumber.toHexString(), 32);
    return Array.from(bytes32);
}

export function getProxyAuthorityPda(proxyProgramId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(PROXY_AUTHORITY_SEED, "utf8")],
        proxyProgramId
    )[0];
}

export function printProxyAuthority(title: string, proxyAuthority: any) {
    console.log(`${title}: {`);
    console.log("  bump: ", proxyAuthority.bump.toString());
    console.log("  owner:", proxyAuthority.owner.toBase58());
    console.log("  nonce:", proxyAuthority.nonce.toString());
    console.log("  dstEid:", proxyAuthority.dstEid.toString());
    console.log("  solChainId:", proxyAuthority.solChainId.toString());
    console.log("  oftProgram:", proxyAuthority.oftProgram.toBase58());
}

export async function initProxy(provider: AnchorProvider, proxyProgram: Program<SolanaProxy>, oftProgramId: PublicKey, nonce: number = 0) {
    const wallet = provider.wallet as Wallet;
    const proxyAuthorityPda = getProxyAuthorityPda(proxyProgram.programId);

    console.log('Init Proxy Authority PDA...')
    console.log('Proxy program ID:', proxyProgram.programId.toBase58())
    console.log('Proxy Authority PDA:', proxyAuthorityPda.toBase58())

    const initProxyParams = {
        owner: wallet.publicKey,
        nonce: new BN(nonce),
        dstEid: getOrderlyEid(),
        solChainId: new BN(getSolanaEid()),
        oftProgram: oftProgramId
    };

    const initProxyAccounts = {
        admin: wallet.publicKey,
        proxyAuthority: proxyAuthorityPda
    };

    const ixInitProxy = await proxyProgram.methods.initProxy(initProxyParams).accounts(initProxyAccounts).instruction();

    await createAndSendV0Tx(
        [ixInitProxy],
        provider,
        wallet
    );
}

export async function createAndSendV0Tx(txInstructions: TransactionInstruction[], provider: AnchorProvider, wallet: Wallet) {
    // Step 1 - Fetch Latest Blockhash
    let latestBlockhash = await provider.connection.getLatestBlockhash('finalized');

    // Step 2 - Generate Transaction Message
    const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);

    // Step 3 - Sign your transaction with the required `Signers`
    transaction.sign([wallet.payer]);

    // Step 4 - Send our v0 transaction to the cluster
    const txid = await provider.connection.sendTransaction(transaction, { maxRetries: 5 });
    console.log("   ✅ - Transaction sent to network", txid);

    await new Promise((r) => setTimeout
        (r, 2000));
}

export function bytes32ToEvmAddress(bytes32Address: Uint8Array): string {
    if (bytes32Address.length !== 32) {
        throw new Error("Invalid peerAddress length. Expected 32 bytes.");
    }

    // Slice the last 20 bytes
    const evmAddressBytes = bytes32Address.slice(-20);

    // Convert to hexadecimal string and prepend '0x'
    const evmAddress = '0x' + Array.from(evmAddressBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    return evmAddress;
}

export async function getOftSendAccounts(provider: AnchorProvider, oftProgramIdStr: string, oftEscrowPdaStr: string, signerPubKey: PublicKey, dstEid: number) {
    const umi = createUmi(provider.connection)

    const oftProgramId = metaplexPublicKey(oftProgramIdStr)
    const deriver = new OftPDA(oftProgramId);

    const tokenEscrow = metaplexPublicKey(oftEscrowPdaStr)
    const tokenEscrowInfo = await getAccount(provider.connection, new PublicKey(tokenEscrow))
    const tokenMint = fromWeb3JsPublicKey(tokenEscrowInfo.mint);

    const tokenSource = await getAssociatedTokenAddress(toWeb3JsPublicKey(tokenMint), signerPubKey, true)

    const [oftStore] = deriver.oftStore(tokenEscrow)
    const [peer] = deriver.peer(oftStore, dstEid)
    const peerInfo = await accounts.fetchPeerConfig(umi, peer)

    const [eventAuthorityPDA] = new EventPDADeriver(new PublicKey(oftProgramIdStr)).eventAuthority()
    const tokenProgram = fromWeb3JsPublicKey(TOKEN_PROGRAM_ID)
    const helper = new SendHelper()

    const txBuilder = instructions.send(
        { programs: oft.createOFTProgramRepo(oftProgramId) },
        {
            signer: createNoopSigner(fromWeb3JsPublicKey(signerPubKey)),
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
                signerPubKey,
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
