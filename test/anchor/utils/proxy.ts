import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { SolanaProxy } from "../../../target/types/solana_proxy";
import { stringToBytes32, getProxyAuthorityPda, printProxyAuthority, initProxy, getConfig } from '../../../tasks/proxy/utils';
import { ConfirmOptions, PublicKey } from '@solana/web3.js';

export const confirmOptions: ConfirmOptions = { maxRetries: 6, commitment: "confirmed", preflightCommitment: "confirmed" };

export const testInitProxy = async (provider: AnchorProvider, proxyProgram: Program<SolanaProxy>) => {
    const proxyAuthorityPda = getProxyAuthorityPda(proxyProgram.programId);
    console.log("Proxy Authority PDA:", proxyAuthorityPda.toBase58());

    let proxyAuthority: any;
    try {
        proxyAuthority = await proxyProgram.account.proxyAuthority.fetch(proxyAuthorityPda);
        printProxyAuthority("Proxy Authority already initialized", proxyAuthority);
    } catch {
        const config = getConfig();
        const oftProgram = new PublicKey(config.oftProgramId);
        await initProxy(provider, proxyProgram, oftProgram);
        proxyAuthority = await proxyProgram.account.proxyAuthority.fetch(proxyAuthorityPda);
        printProxyAuthority("Proxy Authority initialized:", proxyAuthority);
    }
}

export const testClaimReward = async (provider: AnchorProvider, proxyProgram: Program<SolanaProxy>) => {
    const cumulativeAmountArray = stringToBytes32("1234567890");
    const proof = [
        "0xae04af11dc3968a94f29f8d0b4f11c1890c2483a239c5a333545fc73d953bb1d",
        "0x93544216020fd51b6fcaaa9a88420f01d90f6298a4c39c1d20b02653b578eb60",
        "0xcf7d0d4c8b5c18c3788e473dc0cdc256c5f2b01c8eca797ea19ceded9a184c49"
    ];
    const proofArray = proof.map((p) => Array.from(Uint8Array.from(Buffer.from(p.slice(2), 'hex'))));
    const proxyAuthorityPda = getProxyAuthorityPda(proxyProgram.programId);

    const claimRewardParams = {
        distributionId: 0,
        cumulativeAmount: cumulativeAmountArray,
        merkleProof: proofArray,
    };

    const claimRewardAccounts = {
        proxyAuthority: proxyAuthorityPda
    };

    const tx = await proxyProgram.methods.claimReward(claimRewardParams).accounts(claimRewardAccounts).rpc(confirmOptions);
    console.log("Claim Reward Transaction Signature:", tx);
}