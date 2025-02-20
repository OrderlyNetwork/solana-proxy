import { PublicKey } from '@solana/web3.js'
import { addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ethers } from 'ethers'
import { BN } from '@coral-xyz/anchor'

export const ENDPOINT_PROGRAM_ID = new PublicKey('76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6')
export const SEND_LIB_PROGRAM_ID = new PublicKey('7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH')
export const RECEIVE_LIB_PROGRAM_ID = SEND_LIB_PROGRAM_ID
export const TREASURY_PROGRAM_ID = SEND_LIB_PROGRAM_ID
export const ULN_PROGRAM_ID = SEND_LIB_PROGRAM_ID
export const EXECUTOR_PROGRAM_ID = new PublicKey('6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn')
export const EXECUTOR_PDA = new PublicKey('AwrbHeCyniXaQhiJZkLhgWdUCteeWSGaSN1sTfLiY7xK')
export const DVN_PROGRAM_ID = new PublicKey('HtEYV4xB4wvsj5fgTkcfuChYpvGYzgzwvNhgDZQNh7wW')
export const PRICE_FEED_PROGRAM_ID = new PublicKey('8ahPGPjEbpgGaZx2NV1iG5Shj7TDwvsjkEDcGWjt94TP')

export const DEFAULT_SEND_LIB_CONFIG_PDA = new PublicKey('3hfYq9afjFbedp4GZk6n9ZefuCbhvgf4z4Jiyw2QEEPY')
export const DEFAULT_RECEIVE_LIB_CONFIG_PDA = new PublicKey('5zekkyLszMmcPKhJNhkwctXdEEg4xLtwbfayZkaFhNCQ')

export const CHAIN_EVENT_ID_PLACEHOLDER = 0 // placeholder for the chain_event_id field in the OCCVaultMessage type
export const DST_EID = 40200
export const TEST_DST_EID = EndpointId.ORDERLY_V2_TESTNET // eid of orderly testnet, defined by layerzero: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
export const MAIN_DST_EID = EndpointId.ORDERLY_V2_MAINNET // eid of orderly mainnet, defined by layerzero: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts

export const DEV_SOL_CHAIN_ID = 901901901 // the chainid for solana devnet, defined by orderly
export const MAIN_SOL_CHAIN_ID = 900900900 // the chainid for solana mainnet, defined by orderly

export const ORDER_BACKWARD_FEE = new BN(1234567)
export const USDC_BACKWARD_FEE = new BN(12345678)

export const ENV = ['local', 'dev', 'qa', 'staging', 'mainnet']

export const SOLANA_INFO: { [key: string]: any } = {
    local: {
        rpc: 'http://localhost:8899',
        chainEventId: CHAIN_EVENT_ID_PLACEHOLDER,
        solChainId: DEV_SOL_CHAIN_ID,
    },
    dev: {
        rpc: 'https://api.devnet.solana.com',
        chainEventId: CHAIN_EVENT_ID_PLACEHOLDER,
        solChainId: DEV_SOL_CHAIN_ID,
    },
    qa: {
        rpc: 'https://api.devnet.solana.com',
        chainEventId: CHAIN_EVENT_ID_PLACEHOLDER,
        solChainId: DEV_SOL_CHAIN_ID,
    },
    staging: {
        rpc: 'https://api.devnet.solana.com',
        chainEventId: CHAIN_EVENT_ID_PLACEHOLDER,
        solChainId: DEV_SOL_CHAIN_ID,
    },
    mainnet: {
        rpc: 'https://api.mainnet-beta.solana.com',
        chainEventId: CHAIN_EVENT_ID_PLACEHOLDER,
        solChainId: MAIN_SOL_CHAIN_ID,
    },
}

export const ORDER_DECIMALS_ON_ETHEREUM = ethers.BigNumber.from('1000000000000000000') // 10^18
export const DECIMALS_SCALE_FACTOR = ethers.BigNumber.from('100000000') // 10^8
export const ORDER_DECIMALS_ON_SOLANA = ethers.BigNumber.from('10000000000') // 10^10
export const USDC_DECIMALS_ON_SOLANA = ethers.BigNumber.from('1000000') // 10^6
export const VALOR_DECIMALS_ON_SOLANA = ethers.BigNumber.from('1000000') // 10^6

export const LZ_RECEIVE_TYPES_SEED = 'LzReceiveTypes'
export const PEER_SEED = 'Peer'
export const PROXY_CONFIG_SEED = 'ProxyConfig'
export const CLAIM_DATA_SEED = 'ClaimData'
export const ACCOUNT_LIST_SEED = 'AccountList'
export const BACKWARD_FEE_SEED = 'BackwardFee'
export const PROXY_ACCOUNTS: { [key: string]: any } = {
    local: {
        programId: new PublicKey('6sH1YKAatvQqMCQcQoh3feMzXipuaYkHKGeDLUHpatrz'),
        usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        peerAddress: addressToBytes32('0xF2BC568E4bD0F7437C77FA982F4b51786086872a'),
        multisig: new PublicKey('AbQgW1N8JAZxQFdh3VTx3ukGdGCN1vQYADktp3d2HDYw'),
    },
    dev: {
        programId: new PublicKey('5jnoCeAzwFmqQbABqm5hPT7fB9SaDu8xfm5mm1CfGsMQ'),
        usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        peerAddress: addressToBytes32('0xF2BC568E4bD0F7437C77FA982F4b51786086872a'),
        multisig: new PublicKey('AbQgW1N8JAZxQFdh3VTx3ukGdGCN1vQYADktp3d2HDYw'),
    },
    qa: {
        programId: new PublicKey('2HH2MwVZKqizwQ8DV4CAibLiTqQtkR7SmHDLPimut6rV'),
        usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        peerAddress: addressToBytes32('0xF2BC568E4bD0F7437C77FA982F4b51786086872a'),
        multisig: new PublicKey('2WG7UG81NsutAzKDpJp6ZepEisMKrXS9XvMVPhsfqtuB'),
    },
    staging: {
        programId: new PublicKey('Dwnm7RyRY9mYLwqZbwfc54qKqziapBL39XHgZexJmnAq'),
        usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        peerAddress: addressToBytes32('0xF2BC568E4bD0F7437C77FA982F4b51786086872a'),
        oftStore: new PublicKey('2CTq4P25faaymcqMCCwHzdiyvbUJShtPS74qDRZwYX6J'),
    },
    mainnet: {
        programId: new PublicKey('Dwnm7RyRY9mYLwqZbwfc54qKqziapBL39XHgZexJmnAq'),
        usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        peerAddress: addressToBytes32('0xF2BC568E4bD0F7437C77FA982F4b51786086872a'),
        multisig: new PublicKey('6aQHPsgaSxCGwf1uAVetEmzuz9bpv9Rn4bq9jTg91RH8'),
    },
}

export const OFT_ACCOUNTS: { [key: string]: any } = {
    local: {
        programId: new PublicKey('Cz7PQf471Pg3MiHKbKSTTZD5am2ZjJ93bon3gPThyH6v'),
        mint: new PublicKey('DW7MkwAmEUV72vQNi8dCu9rzeqaBrR8AtxyVaj2rXBxT'),
        mintAuthority: new PublicKey('6oRZ8usrt5gfARp2HB8yq2A1qUZft9UkGaP3kWRvj77F'),
        escrow: new PublicKey('BsePJupeGSfvi919fg5pvvxGY5Y1uZS7x7uFyzMaYJuP'),
        oftStore: new PublicKey('6oRZ8usrt5gfARp2HB8yq2A1qUZft9UkGaP3kWRvj77F'),
        ledgerOccManger: addressToBytes32('0xb846DF606b592B9646db03aE2568951651D9D5BC'),
        evmOftAddress: addressToBytes32('0xe2eB2df1CA9D90c8501049bAEEEf57f111782903'),
        // alt: address lookup table account for oft
        alt: new PublicKey('HdLTw2ASK3GBqpUxTyW6bnAVBb4JkBomuGZQFeDnVFxm'), // TODO: placeholder
        //
    },
    dev: {
        rogramId: new PublicKey('Cz7PQf471Pg3MiHKbKSTTZD5am2ZjJ93bon3gPThyH6v'),
        mint: new PublicKey('DW7MkwAmEUV72vQNi8dCu9rzeqaBrR8AtxyVaj2rXBxT'),
        mintAuthority: new PublicKey('6oRZ8usrt5gfARp2HB8yq2A1qUZft9UkGaP3kWRvj77F'),
        escrow: new PublicKey('BsePJupeGSfvi919fg5pvvxGY5Y1uZS7x7uFyzMaYJuP'),
        oftStore: new PublicKey('6oRZ8usrt5gfARp2HB8yq2A1qUZft9UkGaP3kWRvj77F'),
        ledgerOccManger: addressToBytes32('0xb846DF606b592B9646db03aE2568951651D9D5BC'),
        evmOftAddress: addressToBytes32('0xe2eB2df1CA9D90c8501049bAEEEf57f111782903'),
        // alt: address lookup table account for oft
        alt: new PublicKey('HdLTw2ASK3GBqpUxTyW6bnAVBb4JkBomuGZQFeDnVFxm'), // TODO: placeholder
    },
    qa: {
        programId: new PublicKey('B2BBh7JdvdsmzuG7b4dedeBjSMfmiS91z6gQS3DhRLns'),
        mint: new PublicKey('HJzi8SG3NtDx3vyuw3Gaq1jdCEYDqiWCyCrVKHCqKW2H'),
        mintAuthority: new PublicKey('2CTq4P25faaymcqMCCwHzdiyvbUJShtPS74qDRZwYX6J'),
        escrow: new PublicKey('85FsyjiLqfyZciG1s3ERzsc47LuxQiEnoUfcnV9urAYZ'),
        // alt: address lookup table account for oft
        alt: new PublicKey('HdLTw2ASK3GBqpUxTyW6bnAVBb4JkBomuGZQFeDnVFxm'),
        ledgerOccManger: addressToBytes32('0xD14bEE159B4a8E918f0A43EBf2F801eea93BeD53'),
        evmOftAddress: addressToBytes32('0x562874e9fcb02Ae6164781EcFb4AeAa169E99B18'),
    },
    staging: {
        programId: new PublicKey('3LftFSsxKksyiPYZyJ68Y6VuWcRkVce3Zg5TxwLC6D1o'),
        mint: new PublicKey('8bgqsYvAQQCjXyi9ePx4ZG9jVazwe2ptSiKZYYNsq4rY'),
        mintAuthority: new PublicKey('76XwEc7cdcrYpi7PNn5t9TxX3fUQiXjeqVN68GsBdcpk'),
        escrow: new PublicKey('69q8xwVRgx6UgBmt3C2DayxEUyphKfYENHQyxZ6kMWg3'),
        oftStore: new PublicKey('76XwEc7cdcrYpi7PNn5t9TxX3fUQiXjeqVN68GsBdcpk'),
        multisig: new PublicKey('48usEusxMDBxpjLkyrarHupqodAfxXyoaLDVNDJFvkME'),
        // alt: address lookup table account for oft
        alt: new PublicKey('HdLTw2ASK3GBqpUxTyW6bnAVBb4JkBomuGZQFeDnVFxm'),
        ledgerOccManger: addressToBytes32('0x45f3039A9A0eefcC8997e030d9F3cCBb1A7AC6C1'),
        evmOftAddress: addressToBytes32('0x5f11B4510BC50EfB82Fb55D7839a46e9b621f8C2'),
    },
    mainnet: {
        programId: new PublicKey('GZGX6QfUo62VbPyYqPZS6t27Uke1dJmoAP6V3rw6ntTH'),
        mint: new PublicKey('ABt79MkRXUsoHuV2CVQT32YMXQhTparKFjmidQxgiQ6E'),
        mintAuthority: new PublicKey('Efvf2QfcPAJc8XCd1MV1MN1JLNDZRKj2ZbJ3xg6pAf7'),
        escrow: new PublicKey('7PGWT8rti8jpRiySA9pfG3fiReW5Go8jQp3UWXc5SrSk'),
        oftStore: new PublicKey('Efvf2QfcPAJc8XCd1MV1MN1JLNDZRKj2ZbJ3xg6pAf7'),
        // alt: address lookup table account for oft
        alt: new PublicKey('HdLTw2ASK3GBqpUxTyW6bnAVBb4JkBomuGZQFeDnVFxm'),
        ledgerOccManger: addressToBytes32('0x68835941c7C300bFEF44D1D68b83798791901eB8'),
        evmOftAddress: addressToBytes32('0x4E200fE2f3eFb977d5fd9c430A41531FB04d97B8'),
    },
}

export const OPTIONS: { [key: string]: any } = {
    local: {
        LZ_RECEIVE_GAS: 1000000,
        LZ_RECEIVE_VALUE: 0,
        LZ_COMPOSE_GAS: 0,
        LZ_COMPOSE_VALUE: 0,
    },
    dev: {
        LZ_RECEIVE_GAS: 1000000,
        LZ_RECEIVE_VALUE: 0,
        LZ_COMPOSE_GAS: 0,
        LZ_COMPOSE_VALUE: 0,
    },
    qa: {
        LZ_RECEIVE_GAS: 1000000,
        LZ_RECEIVE_VALUE: 0,
        LZ_COMPOSE_GAS: 0,
        LZ_COMPOSE_VALUE: 0,
    },
    staging: {
        LZ_RECEIVE_GAS: 1000000,
        LZ_RECEIVE_VALUE: 0,
        LZ_COMPOSE_GAS: 0,
        LZ_COMPOSE_VALUE: 0,
    },
    mainnet: {
        LZ_RECEIVE_GAS: 500000,
        LZ_RECEIVE_VALUE: 0,
        LZ_COMPOSE_GAS: 0,
        LZ_COMPOSE_VALUE: 0,
    },
}

export const LZ_CONFIG: { [key: number]: any } = {
    40200: {
        endpointId: EndpointId.ORDERLY_V2_TESTNET,
        sendLibConfig: {
            sendLibAddress: '2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ',
            executorConfig: {
                executorAddress: 'AwrbHeCyniXaQhiJZkLhgWdUCteeWSGaSN1sTfLiY7xK',
                maxMessageSize: 10000,
            },
            ulnConfig: {
                confirmations: 10,
                requiredDVNCount: 1,
                optionalDVNCount: 0,
                optionalDVNThreshold: 0,
                requiredDVNs: ['4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb'],
                optionalDVNs: [],
            },
        },
        receiveLibConfig: {
            receiveLibAddress: '2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ',
            timeout: 0,
            ulnConfig: {
                confirmations: 1,
                requiredDVNCount: 1,
                optionalDVNCount: 0,
                optionalDVNThreshold: 0,
                requiredDVNs: ['4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb'],
                optionalDVNs: [],
            },
        },
    },
    30213: {
        endpointId: EndpointId.ORDERLY_V2_MAINNET,
        sendLibConfig: {
            sendLibAddress: '2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ',
            executorConfig: {
                executorAddress: 'AwrbHeCyniXaQhiJZkLhgWdUCteeWSGaSN1sTfLiY7xK',
                maxMessageSize: 10000,
            },
            ulnConfig: {
                confirmations: 32,
                requiredDVNCount: 1,
                optionalDVNCount: 0,
                optionalDVNThreshold: 0,
                requiredDVNs: ['4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb'],
                optionalDVNs: [],
            },
        },
        receiveLibConfig: {
            receiveLibAddress: '2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ',
            timeout: 0,
            ulnConfig: {
                confirmations: 5,
                requiredDVNCount: 1,
                optionalDVNCount: 0,
                optionalDVNThreshold: 0,
                requiredDVNs: ['4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb'],
                optionalDVNs: [],
            },
        },
    },
}

export enum LedgerToken {
    ORDER = 0,
    ESORDER = 1,
    USDC = 2,
    PLACEHOLDER = 3,
}

export enum PayloadType {
    /* ====== Payloads From vault side ====== */
    ClaimReward = 0,
    Stake = 1,
    CreateOrderUnstakeRequest = 2,
    CancelOrderUnstakeRequest = 3,
    WithdrawOrder = 4,
    EsOrderUnstakeAndVest = 5,
    CancelVestingRequest = 6,
    CancelAllVestingRequests = 7, // Not supported anymore. Do not remove for backward compatibility
    ClaimVestingRequest = 8,
    RedeemValor = 9,
    ClaimUsdcRevenue = 10,
    /* ====== Backward Payloads from ledger side ====== */
    ClaimRewardBackward = 11,
    WithdrawOrderBackward = 12,
    ClaimVestingRequestBackward = 13,
    ClaimUsdcRevenueBackward = 14,
    /* ====== New Payloads ====== */
    UnstakeOrderNow = 15,
    ClaimRewardSolana = 16,
}
