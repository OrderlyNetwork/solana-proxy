import { TransactionInstruction, VersionedTransaction, TransactionMessage, PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN, Program, setProvider, Wallet } from "@coral-xyz/anchor";
import { ethers } from 'ethers';
import { DEV_PROXY_PROGRAM_ID, MAIN_PROXY_PROGRAM_ID, PROXY_AUTHORITY_SEED, QA_PROXY_PROGRAM_ID, STAGING_PROXY_PROGRAM_ID } from "./constants";
import { IDL, SolanaProxy } from "../../target/types/solana_proxy";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import dev_config from "../../config/dev.json";
import test_config from "../../config/test.json";

export function getEnv(): String {
    const ENV = process.env.ENV;
    if (!ENV) {
        throw new Error("Please set ENV variable in .env file (can be DEV, TEST, QA, STAGING, MAIN)");
    }
    return ENV.toUpperCase();
}

export function setAnchor(): [AnchorProvider, Wallet, string] {
    console.log(`Running on ${getEnv()}`);

    let ANCHOR_PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL;
    if (!ANCHOR_PROVIDER_URL) {
        if (getEnv() === "MAIN" && !!process.env.RPC_URL_SOLANA) {
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA;
        } else {
            process.env.ANCHOR_PROVIDER_URL = process.env.RPC_URL_SOLANA_TESTNET;
        }
    }
    console.log('ANCHOR_PROVIDER_URL:', process.env.ANCHOR_PROVIDER_URL)
    const provider = AnchorProvider.env();
    const rpc = provider.connection.rpcEndpoint;
    setProvider(provider);
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

export function getConfig() {
    const ENV = getEnv();
    if (ENV === "DEV") {
        return dev_config;
    } else if (ENV === "TEST") {
        return test_config;
    }
    throw new Error("Invalid Environment");
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

export function getProxyAuthorityPda(PROXY_PROGRAM_ID: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(PROXY_AUTHORITY_SEED, "utf8")],
        PROXY_PROGRAM_ID
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