// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { OCCVaultMessage, EvmLedgerMessage } from "./OCCTypes.sol";

interface ILedgerOCCManager {
    function ledgerSendToVault(EvmLedgerMessage memory message) external payable;

    function collectUnvestedOrders(uint256 amount) external;

    function ledgerOappReceive(OCCVaultMessage calldata message) external;
}
