import {
    ENFORCED_OPTIONS_SEED,
    EVENT_SEED,
    LZ_RECEIVE_TYPES_SEED,
    OAPP_SEED,
    PEER_SEED,
    MESSAGE_LIB_SEED,
    SEND_LIBRARY_CONFIG_SEED,
    ENDPOINT_SEED,
    NONCE_SEED,
    ULN_SEED,
    SEND_CONFIG_SEED,
    EXECUTOR_CONFIG_SEED,
    PRICE_FEED_SEED,
    DVN_CONFIG_SEED,
    // OFT_SEED,
    RECEIVE_CONFIG_SEED,
    PENDING_NONCE_SEED,
    PAYLOAD_HASH_SEED,
    RECEIVE_LIBRARY_CONFIG_SEED,
} from '@layerzerolabs/lz-solana-sdk-v2'
import { PublicKey } from '@solana/web3.js'
import * as constants from './constants'

export function getLzReceiveTypesAccountsPda(proxyProgramId: PublicKey) {}

export function getProxyConfigPda(proxyProgramId: PublicKey) {
    return PublicKey.findProgramAddressSync([Buffer.from(constants.PROXY_CONFIG_SEED, 'utf8')], proxyProgramId)[0]
}

export function getBackwardFeePda(proxyProgramId: PublicKey) {
    return PublicKey.findProgramAddressSync([Buffer.from(constants.BACKWARD_FEE_SEED, 'utf8')], proxyProgramId)[0]
}

export function getPeerPda(programId: PublicKey, configPda: PublicKey, dstEid: number) {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(PEER_SEED, 'utf8'), configPda.toBuffer(), bufferDstEid],
        programId
    )[0]
}

export function getClaimDataPda(programId: PublicKey, user: PublicKey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(constants.CLAIM_DATA_SEED, 'utf8'), user.toBuffer()],
        programId
    )[0]
}

export function getLzReceiveTypesPda(programId: PublicKey, configPda: PublicKey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(LZ_RECEIVE_TYPES_SEED, 'utf8'), configPda.toBuffer()],
        programId
    )[0]
}

export function getPeerConfigPda(programId: PublicKey, dstEid: number, proxyConfigPda: PublicKey) {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(PEER_SEED, 'utf8'), proxyConfigPda.toBuffer(), bufferDstEid],
        programId
    )[0]
}

export function getOAppConfigPda(programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(OAPP_SEED, 'utf8')], programId)[0]
}

export function getAccountListPda(programId: PublicKey, configPda: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(constants.ACCOUNT_LIST_SEED, 'utf8'), configPda.toBuffer()],
        programId
    )[0]
}

// pda address: F8E8QGhKmHEx2esh5LpVizzcP4cHYhzXdXTwg9w3YYY2
export function getEventAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(EVENT_SEED, 'utf8')], constants.ENDPOINT_PROGRAM_ID)[0]
}

export function getOAppRegistryPda(configPda: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(OAPP_SEED, 'utf8'), configPda.toBuffer()],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getEnforcedOptionsPda(programId: PublicKey, configPda: PublicKey, dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)

    return PublicKey.findProgramAddressSync(
        [Buffer.from(ENFORCED_OPTIONS_SEED, 'utf8'), configPda.toBuffer(), bufferDstEid],
        programId
    )[0]
}

// pda: 2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ
export function getSendLibPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(MESSAGE_LIB_SEED, 'utf8')], constants.SEND_LIB_PROGRAM_ID)[0]
}

export function getSendLibConfigPda(configPda: PublicKey, dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEND_LIBRARY_CONFIG_SEED, 'utf8'), configPda.toBuffer(), bufferDstEid],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

// pda: 526PeNZfw8kSnDU4nmzJFVJzJWNhwmZykEyJr5XWz5Fv
export function getSendLibInfoPda(sendLibPda: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(MESSAGE_LIB_SEED, 'utf8'), sendLibPda.toBuffer()],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getDefaultSendLibConfigPda(dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEND_LIBRARY_CONFIG_SEED, 'utf8'), bufferDstEid],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getReceiveLibConfigPda(configPda: PublicKey, dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(RECEIVE_LIBRARY_CONFIG_SEED, 'utf8'), configPda.toBuffer(), bufferDstEid],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getDefaultReceiveLibConfigPda(dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(RECEIVE_LIBRARY_CONFIG_SEED, 'utf8'), bufferDstEid],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getSendConfigPda(configPda: PublicKey, dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEND_CONFIG_SEED, 'utf8'), bufferDstEid, configPda.toBuffer()],
        constants.SEND_LIB_PROGRAM_ID
    )[0]
}

export function getUlnSendConfigPda(dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEND_CONFIG_SEED, 'utf8'), bufferDstEid],
        constants.SEND_LIB_PROGRAM_ID
    )[0]
}

export function getDefaultSendConfigPda(dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEND_CONFIG_SEED, 'utf8'), bufferDstEid],
        constants.RECEIVE_LIB_PROGRAM_ID
    )[0]
}

export function getReceiveConfigPda(configPda: PublicKey, dstEid: number): PublicKey {
    const bufferSrcEid = Buffer.alloc(4)
    bufferSrcEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(RECEIVE_CONFIG_SEED, 'utf8'), bufferSrcEid, configPda.toBuffer()],
        constants.RECEIVE_LIB_PROGRAM_ID
    )[0]
}

export function getUlnReceiveConfigPda(dstEid: number): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(RECEIVE_CONFIG_SEED, 'utf8'), bufferDstEid],
        constants.RECEIVE_LIB_PROGRAM_ID
    )[0]
}

export function getDefaultReceiveConfigPda(srcEid: number, receiveLibProgramId?: PublicKey): PublicKey {
    const bufferSrcEid = Buffer.alloc(4)
    bufferSrcEid.writeUInt32BE(srcEid)
    const programId = receiveLibProgramId ? receiveLibProgramId : constants.RECEIVE_LIB_PROGRAM_ID
    return PublicKey.findProgramAddressSync([Buffer.from(RECEIVE_CONFIG_SEED, 'utf8'), bufferSrcEid], programId)[0]
}

// pda: 7n1YeBMVEUCJ4DscKAcpVQd6KXU7VpcEcc15ZuMcL4U3
export function getUlnEventAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(EVENT_SEED, 'utf8')], constants.SEND_LIB_PROGRAM_ID)[0]
}

// pda: 2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ
export function getUlnSettingPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(ULN_SEED, 'utf8')], constants.SEND_LIB_PROGRAM_ID)[0]
}

// pda: 2uk9pQh3tB5ErV7LGQJcbWjb4KeJ2UJki5qJZ8QG56G3
export function getEndpointSettingPda(programId?: PublicKey): PublicKey {
    const endpointProgramId = programId ? programId : constants.ENDPOINT_PROGRAM_ID
    return PublicKey.findProgramAddressSync([Buffer.from(ENDPOINT_SEED, 'utf8')], endpointProgramId)[0]
}

export function getNoncePda(configPda: PublicKey, dstEid: number, peer_address: Uint8Array): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(NONCE_SEED, 'utf8'), configPda.toBuffer(), bufferDstEid, peer_address],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getPendingInboundNoncePda(configPda: PublicKey, dstEid: number, peer_address: Uint8Array): PublicKey {
    const bufferDstEid = Buffer.alloc(4)
    bufferDstEid.writeUInt32BE(dstEid)
    return PublicKey.findProgramAddressSync(
        [Buffer.from(PENDING_NONCE_SEED, 'utf8'), configPda.toBuffer(), bufferDstEid, peer_address],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

// pda: AwrbHeCyniXaQhiJZkLhgWdUCteeWSGaSN1sTfLiY7xK
export function getExecutorConfigPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(EXECUTOR_CONFIG_SEED, 'utf8')],
        constants.EXECUTOR_PROGRAM_ID
    )[0]
}

// pda: CSFsUupvJEQQd1F4SsXGACJaxQX4eropQMkGV2696eeQ
export function getPriceFeedPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(PRICE_FEED_SEED, 'utf8')], constants.PRICE_FEED_PROGRAM_ID)[0]
}

// pda: 4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb
export function getDvnConfigPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(DVN_CONFIG_SEED, 'utf8')], constants.DVN_PROGRAM_ID)[0]
}

export function getMessageLibPda(programId?: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(MESSAGE_LIB_SEED, 'utf8')],
        programId ? programId : constants.SEND_LIB_PROGRAM_ID
    )[0]
}

export function getMessageLibInfoPda(msgLibPda: PublicKey, programId?: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(MESSAGE_LIB_SEED, 'utf8'), msgLibPda.toBytes()],
        programId ? programId : constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getPayloadHashPda(sender: PublicKey, srcEid: number, receiver: PublicKey, nonce: bigint): PublicKey {
    const bufferSrcEid = Buffer.alloc(4)
    bufferSrcEid.writeUInt32BE(srcEid)
    const bufferNonce = Buffer.alloc(8)
    bufferNonce.writeBigUInt64BE(nonce)

    return PublicKey.findProgramAddressSync(
        [Buffer.from('PayloadHash'), sender.toBuffer(), bufferSrcEid, receiver.toBuffer(), bufferNonce],
        constants.ENDPOINT_PROGRAM_ID
    )[0]
}

export function getSendLibProgramId(): PublicKey {
    return constants.SEND_LIB_PROGRAM_ID as PublicKey
}

export function getReceiveLibProgramId(): PublicKey {
    return constants.RECEIVE_LIB_PROGRAM_ID as PublicKey
}
