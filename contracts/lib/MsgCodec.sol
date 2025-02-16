// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {SolanaVaultMessage, SolanaLedgerMessage, LedgerToken} from "./OCCTypes.sol";

/**
 * @dev SolanaProxyMsgCodec is a library for encoding and decoding messages between Solana Proxy and LedgerOApp.
 * It provides functions to extract token type, sender, payload type, and payload from a message.
 * 
 * The message format is as follows:
 * For msg from solana proxy to ledgerOapp:
 * +++
 * | tokenType | sender | payloadType | payload |
 * +++
 * 
 * tokenType: 1 byte
 * sender: 32 bytes
 * payloadType: 1 byte
 * payload: rest of the message
 * 
 * For msg from ledgerOapp to solana proxy:
 * +++
 * | tokenType | receiver | payloadType | payload |
 * +++
 * 
 * tokenType: 1 byte
 * receiver: 32 bytes
 * payloadType: 1 byte
 * payload: rest of the message
 */
library SolanaProxyMsgCodec {
    uint8 private constant TOKEN_TYPE_OFF_SET = 1;                      
    uint8 private constant SENDER_OFFSET = TOKEN_TYPE_OFF_SET + 32;      
    uint8 private constant PAYLOAD_TYPE_OFFSET = SENDER_OFFSET + 1;
    uint8 private constant PAYLOAD_OFFSET = PAYLOAD_TYPE_OFFSET;

    function tokenType(bytes calldata _message) internal pure returns (uint8) {
        return uint8(bytes1(_message[0: TOKEN_TYPE_OFF_SET]));
    }

    function sender(bytes calldata _message) internal pure returns (bytes32) {
        return bytes32(_message[TOKEN_TYPE_OFF_SET: SENDER_OFFSET]);
    }

    function payloadType(bytes calldata _message) internal pure returns (uint8) {
        return uint8(bytes1(_message[SENDER_OFFSET: PAYLOAD_OFFSET]));
    }

    function payload(bytes calldata _message) internal pure returns (bytes calldata) {
        return _message[PAYLOAD_OFFSET:];
    }

    function decodeSolanaVaultMessage(bytes calldata _message) internal pure returns (SolanaVaultMessage memory) {
        return SolanaVaultMessage({
            token: LedgerToken(tokenType(_message)),
            sender: sender(_message),
            payloadType: payloadType(_message),
            payload: payload(_message)
        });
    }

    function encodeSolanaLedgerMessage(SolanaLedgerMessage memory _message) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(_message.token),
            bytes32(_message.receiver),
            uint8(_message.payloadType),
            _message.payload  // TODO: check if this is correct
        );
    }
    

    
}