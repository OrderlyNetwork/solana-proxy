import { task } from 'hardhat/config'
import { Program, workspace, BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    createAndSendV0Tx,
    getConfig,
    getAllOftQuoteSendAccounts,
    getOrderlyEid,
    getProxyConfigPda,
    metaplexToWeb3AccountMetaArray,
    setupAnchor,
    amountStrToBytes32,
} from './utils'
import { SolanaProxy } from '../../target/types/solana_proxy'
import { AccountMeta, ComputeBudgetProgram } from '@solana/web3.js'

interface ClaimRewardTaskArgs {
    /**
     * The distribution ID of the reward.
     */
    distributionId: number
    /**
     * The cumulative amount of reward from the Merkle proof.
     */
    cumulativeAmount: string
    /**
     * The Merkle proof of the reward.
     */
    merkleProof: string[]
}

task('proxy:quote-claim-reward', 'Quote claim reward cross-chain fee')
    .addParam('distributionId', 'Distribution ID of the reward', 0, devtoolsTypes.int)
    .addParam('cumulativeAmount', 'cumulative amount of reward from Mrekle proof', '0', devtoolsTypes.string)
    .addParam('merkleProof', 'Merkle proof of the reward', '', devtoolsTypes.csv)
    .setAction(async ({ distributionId, cumulativeAmount, merkleProof }: ClaimRewardTaskArgs) => {
        const config = getConfig()
        const [provider, wallet] = setupAnchor()
        const proxyProgram = workspace.SolanaProxy as Program<SolanaProxy>
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)

        console.log('Quote claim reward cross-chain fee...')
        console.log('Distribution ID:', distributionId)
        console.log('cumulative amount:', cumulativeAmount)
        console.log('Merkle proof:', merkleProof)
        console.log('Proxy program ID:', proxyProgram.programId.toBase58())

        const cumulativeAmountArray = amountStrToBytes32(cumulativeAmount)
        const proofArray = merkleProof.map((p) => Array.from(Uint8Array.from(Buffer.from(p.slice(2), 'hex'))))

        const claimRewardParams = {
            distributionId: distributionId,
            cumulativeAmount: cumulativeAmountArray,
            merkleProof: proofArray,
        }

        const quoteClaimRewardAccounts = {
            proxyConfig: proxyConfigPda,
        }

        const metaplexQuoteRemainingAccounts = await getAllOftQuoteSendAccounts(
            provider,
            config.oftProgramId,
            config.oftEscrowAta,
            proxyConfigPda,
            getOrderlyEid()
        )

        console.log('Quote remaining accounts:', metaplexQuoteRemainingAccounts)

        const web3QuoteClaimRewardAccounts = metaplexToWeb3AccountMetaArray(metaplexQuoteRemainingAccounts)

        console.log('web3 quote remaining accounts:', web3QuoteClaimRewardAccounts)

        try {
            const { lzTokenFee, nativeFee } = await proxyProgram.methods
                .quoteClaimReward(claimRewardParams)
                .accounts(quoteClaimRewardAccounts)
                .remainingAccounts(web3QuoteClaimRewardAccounts)
                .view()
            // const { lzTokenFee, nativeFee } = await proxyProgram.methods
            //     .quoteClaimReward(claimRewardParams)
            //     .accounts(quoteClaimRewardAccounts)
            //     .view();

            console.log('Quote claim reward cross-chain fee:')
            console.log('Native fee:', nativeFee.toString())
            console.log('LZ token fee:', lzTokenFee.toString())
        } catch (e) {
            console.error('Failed to quote claim reward cross-chain fee:', e)
        }
    })
