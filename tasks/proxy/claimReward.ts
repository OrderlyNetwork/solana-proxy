import { task } from 'hardhat/config'
import { BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    createAndSendV0TxWithTable,
    getConfig,
    getOftSendRemainingAccounts,
    getProxyConfigPda,
    setupAnchor,
    amountStrToBytes32,
    getDeployedProxyProgram,
} from './utils'
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js'
import { createNoopSigner } from '@metaplex-foundation/umi'

interface ClaimRewardTaskArgs {
    distributionId: number
    cumulativeAmount: string
    merkleProof: string[]
}

/// Calling this task will claim reward on OmnichainLedger contract on Orderly network from the Solana network.

task('proxy:claim-reward', 'Claim reward from the Solana network')
    .addParam('distributionId', 'Distribution ID of the reward', 0, devtoolsTypes.int)
    .addParam('cumulativeAmount', 'cumulative amount of reward from Mrekle proof', '0', devtoolsTypes.string)
    .addParam('merkleProof', 'Merkle proof of the reward', '', devtoolsTypes.csv)
    .setAction(async ({ distributionId, cumulativeAmount, merkleProof }: ClaimRewardTaskArgs) => {
        const config = getConfig()
        const [provider, wallet] = setupAnchor()
        const proxyProgram = getDeployedProxyProgram(provider)
        const proxyConfigPda = getProxyConfigPda(proxyProgram.programId)
        const proxyEscrowAta = new PublicKey(config.proxyEscrowAta)

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
            proxyEscrow: proxyEscrowAta,
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
        const oftSendRemainingAccounts = getOftSendRemainingAccounts()

        const ixClaimReward = await proxyProgram.methods
            .claimReward(claimRewardParams, sendParam)
            .accounts(claimRewardAccounts)
            .remainingAccounts(oftSendRemainingAccounts)
            .instruction()
        const ixAddComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

        await createAndSendV0TxWithTable([ixClaimReward, ixAddComputeBudget], provider, wallet.payer.publicKey, [
            wallet.payer,
        ])
    })
