import { findAssociatedTokenPda, mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { publicKey, transactionBuilder, createSignerFromKeypair, signerIdentity } from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'
import { task } from 'hardhat/config'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'
import { oft } from '@layerzerolabs/oft-v2-solana-sdk'
import { addComputeUnitInstructions, getExplorerTxLink, getLayerZeroScanLink } from '../solana/index'
import {
    encodeClaimRewardPayload,
    encodeOCCVaultMessage,
    encodeUserRequestPayload,
    getConfig,
    getOrderlyEid,
    getSolanaEid,
    LedgerToken,
    oftSendWithComposeMsg,
    PayloadDataType,
    setupAnchor,
} from './utils'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'

type RequestPayloadType = number | string

function getPayloadDataType(payloadType: RequestPayloadType): PayloadDataType {
    if (!isNaN(Number(payloadType))) {
        payloadType = Number(payloadType)
    }

    if (typeof payloadType === 'string') {
        payloadType = payloadType.toLowerCase()
    }

    switch (payloadType) {
        case 1:
        case 'stake':
            return PayloadDataType.Stake
        case 2:
        case 'createorderunstakerequest':
            return PayloadDataType.CreateOrderUnstakeRequest
        case 3:
        case 'cancelorderunstakerequest':
            return PayloadDataType.CancelOrderUnstakeRequest
        case 4:
        case 'withdraworder':
            return PayloadDataType.WithdrawOrder
        case 5:
        case 'esorderunstakeandvest':
            return PayloadDataType.EsOrderUnstakeAndVest
        case 6:
        case 'cancelvestingrequest':
            return PayloadDataType.CancelVestingRequest
        case 8:
        case 'claimvestingrequest':
            return PayloadDataType.ClaimVestingRequest
        case 9:
        case 'redeemvalor':
            return PayloadDataType.RedeemValor
        case 10:
        case 'claimusdcrevenue':
            return PayloadDataType.ClaimUsdcRevenue
        case 15:
        case 'unstakeordernow':
            return PayloadDataType.UnstakeOrderNow
        default:
            throw new Error(`Unsupported payload type: ${payloadType}`)
    }
}

interface SendUserRequestTaskArgs {
    amount: string
    payloadType: string
}

/// Send user request with particular payload type, that defines the action to be taken on OmnichainLedger contract on Orderly network from the Solana network.
task('proxy:send-user-request', 'Send user request to the OmnichainLedger contract on Orderly network')
    .addParam('amount', 'amount or request id depending on request type ', '0', devtoolsTypes.string)
    .addParam('payloadType', 'payload type', undefined, devtoolsTypes.string)
    .setAction(async ({ amount, payloadType }: SendUserRequestTaskArgs) => {
        const payloadDataType = getPayloadDataType(payloadType)
        console.log('Payload data type:', payloadDataType)

        const [provider, wallet] = setupAnchor()

        // TODO: Get chainedEventId from Proxy contract
        const chainedEventId = 123

        let payload: Uint8Array
        let token = LedgerToken.PLACEHOLDER
        if (payloadDataType === PayloadDataType.Stake) {
            payload = Buffer.from('')
            token = LedgerToken.ORDER
        } else {
            payload = encodeUserRequestPayload(amount)
            amount = '0'
        }

        const composeMsg = encodeOCCVaultMessage(
            chainedEventId,
            getSolanaEid(),
            token,
            amount,
            wallet.publicKey,
            payloadDataType,
            payload
        )
        oftSendWithComposeMsg(provider, '0', composeMsg)
    })
