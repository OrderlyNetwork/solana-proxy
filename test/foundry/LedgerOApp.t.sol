// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

// LedgerOApp imports
import { PayloadDataType, LzOptions, PayloadDataType, LedgerToken, SolanaVaultMessage, SolanaLedgerMessage, OCCLedgerMessage } from "../../contracts/lib/OCCTypes.sol";
import { SolanaProxyMsgCodec } from "../../contracts/lib/MsgCodec.sol";
import { LedgerOApp, Origin } from "../../contracts/LedgerOApp.sol";

// LedgerOCCManager imports
import { LedgerOCCManagerMock } from "./LedgerOCCManagerMock.sol";

// OApp imports
import { IOAppOptionsType3, EnforcedOptionParam } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { GUID, AddressCast } from "@layerzerolabs/lz-evm-protocol-v2/contracts/libs/GUID.sol";
import { EndpointV2Mock } from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import { PausableUpgradeable, MessagingFee, Origin } from "../../contracts/layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppUpgradeable.sol";
import { OAppSenderUpgradeable } from "../../contracts/layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSenderUpgradeable.sol";
import { OAppReceiverUpgradeable } from "../../contracts/layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppReceiverUpgradeable.sol";
import { OAppCoreUpgradeable } from "../../contracts/layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppCoreUpgradeable.sol";
import { IOAppCore } from "../../contracts/layerzerolabs/lz-evm-oapp-v2/contracts/oapp/interfaces/IOAppCore.sol";
// OZ imports
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Forge imports
import "forge-std/console.sol";

// DevTools imports
import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";

contract LedgerOAppTest is TestHelperOz5 {
    using OptionsBuilder for bytes;
    using SolanaProxyMsgCodec for bytes;
    using AddressCast for address;
    address private executor = address(0x0);
    address private owner = address(0x1);
    LedgerOCCManagerMock private occManager;
    bytes32 private solanaProxy = bytes32(uint256(3));
    bytes32 private solanaUser = bytes32(uint256(4));
    address private lzEndpoint;
    uint32 private orderlyEid = 1;
    uint32 private solanaEid = 2;
    uint256 private solanaChainId = 901901901;
    uint128 private solanaGas = 500000;
    uint128 private solanaValue = 0;
    LedgerOApp private ledgerOApp;

    function setUp() public virtual override {
        super.setUp();
        vm.deal(address(this), 100 ether);
        vm.deal(owner, 100 ether);

        setUpEndpoints(2, LibraryType.UltraLightNode);

        LedgerOApp ledgerOAppImpl = new LedgerOApp();
        bytes memory ledgerOAppInitData = abi.encodeWithSignature(
            "initialize(address,address)",
            endpoints[orderlyEid],
            owner
        );

        ERC1967Proxy ledgerOAppProxy = new ERC1967Proxy(address(ledgerOAppImpl), ledgerOAppInitData);

        ledgerOApp = LedgerOApp(payable(address(ledgerOAppProxy)));

        LedgerOCCManagerMock ledgerOCCManagerImpl = new LedgerOCCManagerMock();

        ERC1967Proxy ledgerOCCManagerProxy = new ERC1967Proxy(address(ledgerOCCManagerImpl), "");

        occManager = LedgerOCCManagerMock(payable(address(ledgerOCCManagerProxy)));

        vm.startPrank(owner);
        ledgerOApp.setOCCManagerAddr(address(occManager));
        ledgerOApp.setOptions(uint8(PayloadDataType.ClaimUsdcRevenueBackward), solanaGas, solanaValue);
        ledgerOApp.setPeer(solanaEid, solanaProxy);
        occManager.setSolanaEid(solanaEid);
        occManager.setEid2ChainId(solanaEid, solanaChainId);
        vm.stopPrank();
    }

    function test_initialize_setup() public view {
        assertEq(ledgerOApp.owner(), owner);
    }

    function test_owner_functions() public view {
        assertEq(ledgerOApp.occManagerAddr(), address(occManager));

        (uint128 gas, uint128 value) = ledgerOApp.payloadType2LzOptions(
            uint8(PayloadDataType.ClaimUsdcRevenueBackward)
        );
        assertEq(gas, solanaGas);
        assertEq(value, solanaValue);

        assertEq(ledgerOApp.peers(solanaEid), solanaProxy);
    }

    function test_receive_message() public {
        uint64 nonce = 0;
        LedgerToken tokenType = LedgerToken.PLACEHOLDER;
        bytes32 sender = solanaProxy;
        address senderInEvm = address(bytes20(sender));
        uint256 tokenAmount = 100 ether;
        uint256 requestId = 2;
        bytes memory extraData = bytes("");
        bytes memory msgData;
        bytes memory payloadData;
        // {} needed due to stack too deep
        {
            // Test Endpoint address
            address invalidEndpoint = address(0x1234567890);
            vm.startPrank(invalidEndpoint);
            vm.expectRevert(abi.encodeWithSelector(OAppReceiverUpgradeable.OnlyEndpoint.selector, invalidEndpoint));
            ledgerOApp.lzReceive(
                Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
                bytes32(0),
                bytes(""),
                executor,
                extraData
            );
            vm.stopPrank();

            // Test peer address
            bytes32 invalidPeer = bytes32(uint256(123456790));
            vm.startPrank(endpoints[orderlyEid]);
            vm.expectRevert(abi.encodeWithSelector(IOAppCore.OnlyPeer.selector, solanaEid, invalidPeer));
            ledgerOApp.lzReceive(
                Origin({ srcEid: solanaEid, sender: invalidPeer, nonce: nonce }),
                bytes32(0),
                bytes(""),
                executor,
                extraData
            );
            vm.stopPrank();

            // Test srcEid
            uint32 invalidSrcEid = 111;
            vm.startPrank(endpoints[orderlyEid]);
            vm.expectRevert(abi.encodeWithSelector(IOAppCore.NoPeer.selector, invalidSrcEid));
            ledgerOApp.lzReceive(
                Origin({ srcEid: invalidSrcEid, sender: solanaProxy, nonce: nonce }),
                bytes32(0),
                bytes(""),
                executor,
                extraData
            );
            vm.stopPrank();
        }
        // Test vault payload types
        for (uint8 msgType = 0; msgType < 16; msgType++) {
            bytes32 guid = GUID.generate(++nonce, solanaEid, senderInEvm, solanaEid, address(ledgerOApp).toBytes32());
            // Skip unsupported payload types
            if (
                msgType == uint8(PayloadDataType.ClaimReward) ||
                msgType == uint8(PayloadDataType.Stake) ||
                msgType == uint8(PayloadDataType.ClaimRewardBackward) ||
                msgType == uint8(PayloadDataType.WithdrawOrderBackward) ||
                msgType == uint8(PayloadDataType.ClaimVestingRequestBackward) ||
                msgType == uint8(PayloadDataType.ClaimUsdcRevenueBackward)
            ) {
                payloadData = abi.encode(extraData);
                msgData = _encodeSolanaVaultMessage(tokenType, sender, PayloadDataType(msgType), payloadData);
                vm.startPrank(endpoints[orderlyEid]);
                vm.expectRevert("LedgerOApp: invalid vault payload type");
                ledgerOApp.lzReceive(
                    Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
                    guid,
                    msgData,
                    executor,
                    extraData
                );
                vm.stopPrank();
                continue;
            } else if (
                msgType == uint8(PayloadDataType.CancelVestingRequest) ||
                msgType == uint8(PayloadDataType.CancelAllVestingRequests) ||
                msgType == uint8(PayloadDataType.ClaimUsdcRevenueBackward)
            ) {
                payloadData = abi.encode(requestId);
            } else {
                payloadData = abi.encode(tokenAmount);
            }
            msgData = _encodeSolanaVaultMessage(tokenType, sender, PayloadDataType(msgType), payloadData);
            vm.startPrank(endpoints[orderlyEid]);
            ledgerOApp.lzReceive(
                Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
                guid,
                msgData,
                executor,
                extraData
            );
            vm.stopPrank();
        }
    }

    function test_send_message() public {
        vm.deal(address(ledgerOApp), 100 ether);
        vm.deal(address(occManager), 100 ether);
        uint256 beforeBalance = address(occManager).balance;
        LedgerToken tokenType = LedgerToken.USDC;
        uint256 tokenAmount = 100 * 10 ** 6;
        bytes32 receiver = solanaUser;
        uint8 payloadType = uint8(PayloadDataType.ClaimUsdcRevenueBackward);
        bytes memory payload = bytes("");

        OCCLedgerMessage memory occLedgerMessage = OCCLedgerMessage({
            dstChainId: solanaChainId,
            token: tokenType,
            tokenAmount: tokenAmount,
            receiver: receiver,
            payloadType: payloadType,
            payload: payload
        });

        // Test occManager address
        address fakeOccManager = address(0x1234567890);
        vm.startPrank(fakeOccManager);
        vm.expectRevert("OnlyLedgerOCCManager can call this function");
        ledgerOApp.ledgerOappSend(occLedgerMessage);
        vm.stopPrank();

        // Test dstChainId
        uint32 fakeDstChainId = 111;
        occLedgerMessage.dstChainId = fakeDstChainId;
        vm.startPrank(address(occManager));
        vm.expectRevert("LedgerOApp: only send to solana");
        ledgerOApp.ledgerOappSend(occLedgerMessage);
        occLedgerMessage.dstChainId = solanaChainId;
        vm.stopPrank();

        // Test token
        occLedgerMessage.token = LedgerToken.PLACEHOLDER;
        vm.startPrank(address(occManager));
        vm.expectRevert("LedgerOApp: Only USDC is supported");
        ledgerOApp.ledgerOappSend(occLedgerMessage);
        occLedgerMessage.token = LedgerToken.USDC;
        vm.stopPrank();

        // Test fee
        vm.startPrank(address(occManager));
        MessagingFee memory msgFee = ledgerOApp.ledgerOappSendQuote(occLedgerMessage);
        vm.expectRevert("LedgerOApp: insufficient native fee");
        ledgerOApp.ledgerOappSend{ value: msgFee.nativeFee - 1 }(occLedgerMessage);
        vm.stopPrank();

        // Test fee reduce
        vm.startPrank(address(occManager));
        msgFee = ledgerOApp.ledgerOappSendQuote(occLedgerMessage);
        ledgerOApp.ledgerOappSend{ value: msgFee.nativeFee }(occLedgerMessage);
        vm.stopPrank();
        uint256 afterBalance = address(occManager).balance;
        assertEq(afterBalance, beforeBalance - msgFee.nativeFee);

        // Test fee refund
        vm.startPrank(address(occManager));
        ledgerOApp.ledgerOappSend{ value: msgFee.nativeFee + 1 }(occLedgerMessage);
        vm.stopPrank();
        assertEq(afterBalance - msgFee.nativeFee, address(occManager).balance);

        // Test occManager.solanaEid()
        occManager.setSolanaEid(0);
        vm.startPrank(address(occManager));
        vm.expectRevert("LedgerOApp: Solana eid not set on LedgerOCCManager");
        ledgerOApp.ledgerOappSend(occLedgerMessage);
        occManager.setSolanaEid(solanaEid);
        vm.stopPrank();

        // Test occManager.setEid2ChainId(solanaEid, solanaChainId);
        occManager.setEid2ChainId(solanaEid, 0);
        vm.startPrank(address(occManager));
        vm.expectRevert("LedgerOApp: Solana chain id not set on LedgerOCCManager");
        ledgerOApp.ledgerOappSend(occLedgerMessage);
        occManager.setEid2ChainId(solanaEid, solanaChainId);
        vm.stopPrank();
    }

    /**
     * @dev Tests that the pause/unpause functionality works correctly
     */
    function test_pause_unpause() public {
        // Check initial state
        assertFalse(ledgerOApp.paused(), "LedgerOApp should not be paused initially");

        // Non-owner should not be able to pause
        vm.startPrank(address(0x123));
        vm.expectRevert(); // Should revert with an Ownable error
        ledgerOApp.pause();
        vm.stopPrank();

        // Owner should be able to pause
        vm.startPrank(owner);
        ledgerOApp.pause();
        vm.stopPrank();

        // Check paused state
        assertTrue(ledgerOApp.paused(), "LedgerOApp should be paused");

        // Non-owner should not be able to unpause
        vm.startPrank(address(0x123));
        vm.expectRevert(); // Should revert with an Ownable error
        ledgerOApp.unpause();
        vm.stopPrank();

        // Owner should be able to unpause
        vm.startPrank(owner);
        ledgerOApp.unpause();
        vm.stopPrank();

        // Check unpaused state
        assertFalse(ledgerOApp.paused(), "LedgerOApp should be unpaused");
    }

    /**
     * @dev Tests that the lzReceive function properly respects the pause state
     * When paused, the contract should not process incoming messages
     */
    function test_lzReceive_whenPaused() public {
        uint64 nonce = 1;
        LedgerToken tokenType = LedgerToken.PLACEHOLDER;
        PayloadDataType payloadType = PayloadDataType.ClaimVestingRequest;
        uint256 tokenAmount = 100 ether;
        bytes memory extraData = bytes("");
        bytes memory payloadData = abi.encode(tokenAmount);
        bytes memory msgData = _encodeSolanaVaultMessage(tokenType, solanaProxy, payloadType, payloadData);

        // Pause the contract first
        vm.startPrank(owner);
        ledgerOApp.pause();
        vm.stopPrank();
        assertTrue(ledgerOApp.paused(), "LedgerOApp should be paused");

        // Try to receive a message while paused
        vm.startPrank(endpoints[orderlyEid]);
        bytes32 guid = GUID.generate(
            nonce,
            solanaEid,
            address(bytes20(solanaProxy)),
            orderlyEid,
            address(ledgerOApp).toBytes32()
        );

        // This should revert because the contract is paused
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        ledgerOApp.lzReceive(
            Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
            guid,
            msgData,
            executor,
            extraData
        );
        vm.stopPrank();

        // Unpause the contract
        vm.startPrank(owner);
        ledgerOApp.unpause();
        vm.stopPrank();
        assertFalse(ledgerOApp.paused(), "LedgerOApp should be unpaused");

        // Now the contract should accept messages
        vm.startPrank(endpoints[orderlyEid]);
        ledgerOApp.lzReceive(
            Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
            guid,
            msgData,
            executor,
            extraData
        );
        vm.stopPrank();

        // Verify occManager received the message (we need to check the logs or mocked function calls)
        // For this simple test, we just ensure no revert happened
    }

    /**
     * @dev Tests that the lzReceive function properly respects the pause state
     * for different message types
     */
    function test_lzReceive_multipleMessageTypes_whenPaused() public {
        uint64 nonce = 0;
        LedgerToken tokenType = LedgerToken.PLACEHOLDER;
        bytes memory extraData = bytes("");

        // Array of payload types to test
        PayloadDataType[] memory payloadTypes = new PayloadDataType[](3);
        payloadTypes[0] = PayloadDataType.CreateOrderUnstakeRequest;
        payloadTypes[1] = PayloadDataType.WithdrawOrder;
        payloadTypes[2] = PayloadDataType.ClaimVestingRequest;

        // Test each payload type
        for (uint i = 0; i < payloadTypes.length; i++) {
            PayloadDataType payloadType = payloadTypes[i];

            // Create appropriate payload data
            bytes memory payloadData;
            if (payloadType == PayloadDataType.ClaimVestingRequest) {
                payloadData = abi.encode(uint256(2)); // requestId for ClaimVestingRequest
            } else {
                payloadData = abi.encode(uint256(100 ether)); // tokenAmount for other types
            }

            bytes memory msgData = _encodeSolanaVaultMessage(tokenType, solanaProxy, payloadType, payloadData);

            // Pause the contract
            vm.startPrank(owner);
            ledgerOApp.pause();
            vm.stopPrank();

            // Try to receive a message while paused
            vm.startPrank(endpoints[orderlyEid]);
            bytes32 guid = GUID.generate(
                ++nonce,
                solanaEid,
                address(bytes20(solanaProxy)),
                orderlyEid,
                address(ledgerOApp).toBytes32()
            );

            // Should revert due to pause
            vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
            ledgerOApp.lzReceive(
                Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
                guid,
                msgData,
                executor,
                extraData
            );
            vm.stopPrank();

            // Unpause the contract
            vm.startPrank(owner);
            ledgerOApp.unpause();
            vm.stopPrank();

            // Now the contract should accept messages
            vm.startPrank(endpoints[orderlyEid]);
            ledgerOApp.lzReceive(
                Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
                guid,
                msgData,
                executor,
                extraData
            );
            vm.stopPrank();
        }
    }

    /**
     * @dev Tests that the ledgerOappSend function still works when the contract is paused
     * Sending should still be allowed even if receiving is paused
     */
    function test_ledgerOappSend_whenPaused() public {
        vm.deal(address(ledgerOApp), 100 ether);
        vm.deal(address(occManager), 100 ether);

        // Prepare message parameters
        LedgerToken tokenType = LedgerToken.USDC;
        uint256 tokenAmount = 100 * 10 ** 6;
        bytes32 receiver = solanaUser;
        uint8 payloadType = uint8(PayloadDataType.ClaimUsdcRevenueBackward);
        bytes memory payload = bytes("");

        OCCLedgerMessage memory occLedgerMessage = OCCLedgerMessage({
            dstChainId: solanaChainId,
            token: tokenType,
            tokenAmount: tokenAmount,
            receiver: receiver,
            payloadType: payloadType,
            payload: payload
        });

        // Get the quote first
        vm.startPrank(address(occManager));
        MessagingFee memory msgFee = ledgerOApp.ledgerOappSendQuote(occLedgerMessage);
        vm.stopPrank();

        // Pause the contract
        vm.startPrank(owner);
        ledgerOApp.pause();
        vm.stopPrank();
        assertTrue(ledgerOApp.paused(), "LedgerOApp should be paused");

        // Send should still work even when paused
        vm.startPrank(address(occManager));
        ledgerOApp.ledgerOappSend{ value: msgFee.nativeFee }(occLedgerMessage);
        vm.stopPrank();

        // No assertion needed, success is determined by no revert
    }

    function _encodeSolanaVaultMessage(
        LedgerToken _tokenType,
        bytes32 _sender,
        PayloadDataType _payloadType,
        bytes memory _payload
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(_tokenType), _sender, uint8(_payloadType), _payload);
    }
}
