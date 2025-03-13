// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { OCCVaultMessage, EvmLedgerMessage } from "./OCCTypes.sol";

interface ILedgerOCCManager {
    function ledgerSendToVault(EvmLedgerMessage memory message) external payable;

    function collectUnvestedOrders(uint256 amount) external;

    function ledgerOappReceive(OCCVaultMessage calldata message) external;

    function solanaEid() external view returns (uint32);

    function eid2ChainId(uint32 eid) external view returns (uint256);

    function chainId2Eid(uint256 chainId) external view returns (uint32);

    function setSolanaEid(uint32 eid) external;

    function setEid2ChainId(uint32 eid, uint256 chainId) external;
}
