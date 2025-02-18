// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { ILedgerOCCManager, OCCVaultMessage, EvmLedgerMessage } from "../../contracts/lib/ILedgerOCCManager.sol";

contract LedgerOCCManagerMock is ILedgerOCCManager {
    function ledgerSendToVault(EvmLedgerMessage memory /*message*/) external payable {
        return;
    }

    function collectUnvestedOrders(uint256 /*_amount*/) external pure {
        return;
    }

    function ledgerOappReceive(OCCVaultMessage memory /*message*/) external pure {
        return;
    }
}
