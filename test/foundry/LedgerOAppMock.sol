// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { LedgerOApp, Origin, LedgerToken, SolanaLedgerMessage, SolanaVaultMessage, OCCVaultMessage, SolanaProxyMsgCodec, LzOptions, OptionsBuilder, MessagingFee, PayloadTypeChecker } from "../../contracts/LedgerOApp.sol";

contract LedgerOAppMock is LedgerOApp {
    using SolanaProxyMsgCodec for bytes;
    using OptionsBuilder for bytes;
    using PayloadTypeChecker for uint8;
    event LedgerOAppReceive(OCCVaultMessage occVaultMessage);

    function _lzReceive(
        Origin calldata _origin,
        bytes32 /*_guid*/,
        bytes calldata _message,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        if (_origin.srcEid == solanaEid) {
            SolanaVaultMessage memory solanaVaultMessage = _message.decodeSolanaVaultMessage();
            require(solanaVaultMessage.payloadType.checkVaultPayloadType(), "LedgerOApp: invalid vault payload type");
            OCCVaultMessage memory occVaultMessage = OCCVaultMessage({
                chainedEventId: 0, // @dev: chainEventId will be updated in OCCManager for solana proxy
                srcChainId: eid2ChainId[solanaEid],
                token: solanaVaultMessage.token,
                tokenAmount: uint256(0),
                sender: solanaVaultMessage.sender,
                payloadType: solanaVaultMessage.payloadType,
                payload: solanaVaultMessage.payload
            });
            emit LedgerOAppReceive(occVaultMessage);
            // @dev: comment out to run tests, LedgerOCCManager and OmniLedger contracts should be tested within the OmniLedger repo
            // ILedgerOCCManager(occManagerAddr).ledgerOappReceive(occVaultMessage);
        } else {
            revert("LedgerOApp: only Solana chain supported");
        }
    }
}
