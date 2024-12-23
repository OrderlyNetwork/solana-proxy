import { TransactionInstruction, VersionedTransaction, TransactionMessage, PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN, Program, setProvider, Wallet } from "@coral-xyz/anchor";
import { ethers } from 'ethers';
import { DEV_PROXY_PROGRAM_ID, MAIN_PROXY_PROGRAM_ID, PROXY_AUTHORITY_SEED, QA_PROXY_PROGRAM_ID, STAGING_PROXY_PROGRAM_ID } from "./constants";
import { IDL, SolanaProxy } from "../../target/types/solana_proxy";
import { EndpointId } from "@layerzerolabs/lz-definitions";

export function getEnv(): String {
    const ENV = process.env.ENV;
    if (!ENV) {
        throw new Error("Please set ENV variable in .env file");
    }
    return ENV;
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

export function getSolanaEid(ENV: String): number {
    if (ENV === "MAIN") {
        return EndpointId.SOLANA_V2_MAINNET;
    }
    return EndpointId.SOLANA_V2_TESTNET;
}

export function getOrderlyEid(ENV: String): number {
    if (ENV === "MAIN") {
        return EndpointId.ORDERLY_V2_MAINNET;
    }
    return EndpointId.ORDERLY_V2_TESTNET;
}

export function getDeployedProgram(ENV: String, provider: AnchorProvider) {
    let PROXY_PROGRAM_ID
    if (ENV === "DEV") {
        PROXY_PROGRAM_ID = DEV_PROXY_PROGRAM_ID;
    } else if (ENV === "QA") {
        PROXY_PROGRAM_ID = QA_PROXY_PROGRAM_ID;
    } else if (ENV === "STAGING") {
        PROXY_PROGRAM_ID = STAGING_PROXY_PROGRAM_ID;
    } else if (ENV === "MAIN") {
        PROXY_PROGRAM_ID = MAIN_PROXY_PROGRAM_ID;
    } else {
        throw new Error("Invalid Environment");
    }
    const proxyProgram = new Program<SolanaProxy>(IDL, PROXY_PROGRAM_ID, provider);
    return [PROXY_PROGRAM_ID, proxyProgram];
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
}

export async function initProxy(provider: AnchorProvider, proxyProgram: Program<SolanaProxy>, nonce: number = 0) {
    const wallet = provider.wallet as Wallet;
    const proxyAuthorityPda = getProxyAuthorityPda(proxyProgram.programId);

    console.log('Init Proxy Authority PDA...')
    console.log('Proxy program ID:', proxyProgram.programId.toBase58())
    console.log('Proxy Authority PDA:', proxyAuthorityPda.toBase58())

    const initProxyParams = {
        owner: wallet.publicKey,
        nonce: new BN(nonce),
        dstEid: getOrderlyEid(getEnv()),
        solChainId: new BN(getSolanaEid(getEnv())),
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
