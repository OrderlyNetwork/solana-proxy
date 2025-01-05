import { task } from 'hardhat/config'
import { BN } from '@coral-xyz/anchor'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import {
    createAndSendV0TxWithTable,
    getConfig,
    getClaimRewardRemainingAccounts,
    getProxyConfigPda,
    setupAnchor,
    amountStrToBytes32,
    getDeployedProxyProgram,
    encodeClaimRewardPayload,
    encodeOCCVaultMessage,
    getSolanaEid,
    getOftSendAccounts,
    getOrderlyEid,
    getDeployedOftProgram,
    getRemainingOftSendAccounts,
    getOftSendRemainingAccounts,
} from './utils'
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js'
import { createNoopSigner } from '@metaplex-foundation/umi'
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'

interface ClaimRewardTaskArgs {
    distributionId: number
    cumulativeAmount: string
    merkleProof: string[]
}

/// Calling this task will claim reward on OmnichainLedger contract on Orderly network from the Solana network.

task('proxy:claim-reward-lt', 'Claim reward from the Solana network using LookupTable')
    .addParam('distributionId', 'Distribution ID of the reward', 0, devtoolsTypes.int)
    .addParam('cumulativeAmount', 'cumulative amount of reward from Mrekle proof', '0', devtoolsTypes.string)
    .addParam('merkleProof', 'Merkle proof of the reward', '', devtoolsTypes.csv)
    .setAction(async ({ distributionId, cumulativeAmount, merkleProof }: ClaimRewardTaskArgs) => {
        const config = getConfig()
        const [provider, wallet] = setupAnchor()
        const oftProgram = getDeployedOftProgram(provider)

        console.log('Claiming reward from the Solana network...')
        console.log('Distribution ID:', distributionId)
        console.log('cumulative amount:', cumulativeAmount)
        console.log('Merkle proof:', merkleProof)

        const signerAta = getAssociatedTokenAddressSync(new PublicKey(config.mintPda), wallet.publicKey)

        const oftSendAccounts = {
            signer: wallet.publicKey,
            peer: new PublicKey(config.peerPda),
            oftStore: new PublicKey(config.oftStorePda),
            tokenSource: signerAta,
            tokenEscrow: new PublicKey(config.oftEscrowAta),
            tokenMint: new PublicKey(config.mintPda),
            tokenProgram: TOKEN_PROGRAM_ID,
            eventAuthority: new PublicKey(config.unknownPda),
            program: new PublicKey(config.oftProgramId),
        }

        console.log('Claim reward accounts:', oftSendAccounts)

        // TODO: Call quote to get the fee
        const nativeFee = 123456
        const recipientAddressBytes32 = addressToBytes32(config.occManagerAddress)
        const toEid = getOrderlyEid()
        const amount = 0

        const payload = encodeClaimRewardPayload(distributionId, cumulativeAmount, merkleProof)
        const composeMsg = encodeOCCVaultMessage(123, getSolanaEid(), 3, '0', wallet.publicKey, 0, payload)

        const oftSendParams = {
            to: Array.from(recipientAddressBytes32),
            dstEid: toEid,
            amountLd: new BN(amount),
            minAmountLd: new BN(((BigInt(amount) * BigInt(9)) / BigInt(10)).toString()),
            options: Buffer.from(''),
            composeMsg: Buffer.from(composeMsg),
            nativeFee: new BN(nativeFee),
            lzTokenFee: new BN(0),
        }
        console.log('Send params:', oftSendParams)

        const oftSendRemainingAccounts = getOftSendRemainingAccounts(wallet.publicKey)
        console.log('Send remaining accounts:', oftSendRemainingAccounts)

        const ixSend = await oftProgram.methods
            .send(oftSendParams)
            .accounts(oftSendAccounts)
            .remainingAccounts(oftSendRemainingAccounts)
            .instruction()
        const ixAddComputeBudget = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

        await createAndSendV0TxWithTable([ixSend, ixAddComputeBudget], provider, wallet.payer.publicKey, [wallet.payer])
    })
