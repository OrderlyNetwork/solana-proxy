import { task } from 'hardhat/config'
import { Program, workspace, BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    createAndSendV0TxWithTable,
    getConfig,
    getOftSendRemainingAccounts,
    getProxyConfigPda,
    setupAnchor,
    amountStrToBytes32,
} from './utils'
import { SolanaProxy } from '../../target/types/solana_proxy'
import { ComputeBudgetProgram } from '@solana/web3.js'

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

task('proxy:claim-reward', 'Claim reward from the Solana network')
    .addParam('distributionId', 'Distribution ID of the reward', 0, devtoolsTypes.int)
    .addParam('cumulativeAmount', 'cumulative amount of reward from Mrekle proof', '0', devtoolsTypes.string)
    .addParam('merkleProof', 'Merkle proof of the reward', '', devtoolsTypes.csv)
    .setAction(async ({ distributionId, cumulativeAmount, merkleProof }: ClaimRewardTaskArgs) => {
        const config = getConfig()
        const [provider, wallet] = setupAnchor()
        const proxyProgram = workspace.SolanaProxy as Program<SolanaProxy>
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)

        console.log('Claiming reward from the Solana network...')
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

        const claimRewardAccounts = {
            proxyConfig: proxyConfigPda,
        }

        // TODO: Call quote to get the fee
        const nativeFee = 123456

        const sendParam = {
            nativeFee: new BN(nativeFee),
            lzTokenFee: new BN(0),
        }

        // const metaplexOftSendRemainingAccounts = await getOftSendAccounts(provider, config.oftProgramId, config.oftEscrowAta, wallet.publicKey, getOrderlyEid());
        // console.log('Send remaining accounts:', metaplexOftSendRemainingAccounts);
        // const web3OftSendRemainingAccounts = metaplexToWeb3AccountMetaArray(metaplexOftSendRemainingAccounts);
        const oftSendRemainingAccounts = await getOftSendRemainingAccounts()

        const ixClaimReward = await proxyProgram.methods
            .claimReward(claimRewardParams, sendParam)
            .accounts(claimRewardAccounts)
            .remainingAccounts(oftSendRemainingAccounts)
            .instruction()
        const ixAddComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

        await createAndSendV0TxWithTable([ixClaimReward, ixAddComputeBudget], provider, wallet)
    })
