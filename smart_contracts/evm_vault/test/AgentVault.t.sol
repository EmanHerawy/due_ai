// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC-20 for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockDAI is ERC20 {
    constructor() ERC20("Mock DAI", "DAI") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AgentVaultTest is Test {
    AgentVault public vault;
    AgentVaultFactory public factory;
    MockUSDC public usdc;
    MockDAI public dai;

    address public constant OWNER = address(0xA11ce);
    address public constant AGENT = address(0xB0b);
    address public constant RECIPIENT = address(0xC0ffee);
    address public constant RANDOM = address(0xDead);

    address public constant NATIVE_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function setUp() public {
        usdc = new MockUSDC();
        dai = new MockDAI();

        vault = new AgentVault(OWNER);

        factory = new AgentVaultFactory();

        // Fund the owner
        usdc.mint(OWNER, 1_000_000e6);
        dai.mint(OWNER, 1_000_000e18);
        vm.deal(OWNER, 100 ether);
    }

    // ===== Helper =====

    function _depositUSDC(uint256 amount) internal {
        vm.startPrank(OWNER);
        usdc.approve(address(vault), amount);
        vault.deposit(address(usdc), amount);
        vm.stopPrank();
    }

    function _setupAgent() internal {
        vm.prank(OWNER);
        vault.addAgent(AGENT);
    }

    function _setupPolicy() internal {
        vm.prank(OWNER);
        vault.setSpendPolicy(
            AGENT,
            address(usdc),
            1000e6,       // maxPerTx
            5000e6,       // totalPerPeriod
            10,           // maxTxPerPeriod
            30 days       // periodSeconds
        );
    }

    function _fullSetup() internal {
        _depositUSDC(10_000e6);
        _setupAgent();
        _setupPolicy();
    }

    // ===== Test: Constructor =====

    function test_constructor() public view {
        assertEq(vault.owner(), OWNER);
        assertFalse(vault.paused());
    }

    function test_constructor_zero_address_reverts() public {
        vm.expectRevert(AgentVault.ZeroAddress.selector);
        new AgentVault(address(0));
    }

    // ===== Test: Factory =====

    function test_factory_create_vault() public {
        vm.prank(OWNER);
        address v = factory.createVault();
        assertEq(factory.vaults(OWNER), v);
        assertEq(AgentVault(payable(v)).owner(), OWNER);
    }

    function test_factory_duplicate_reverts() public {
        vm.startPrank(OWNER);
        factory.createVault();
        vm.expectRevert(AgentVaultFactory.VaultAlreadyExists.selector);
        factory.createVault();
        vm.stopPrank();
    }

    // ===== Test: Deposit ERC-20 =====

    function test_deposit_erc20() public {
        _depositUSDC(10_000e6);
        assertEq(vault.vaultBalance(address(usdc)), 10_000e6);
    }

    function test_deposit_multiple_tokens() public {
        _depositUSDC(10_000e6);

        vm.startPrank(OWNER);
        dai.approve(address(vault), 50_000e18);
        vault.deposit(address(dai), 50_000e18);
        vm.stopPrank();

        assertEq(vault.vaultBalance(address(usdc)), 10_000e6);
        assertEq(vault.vaultBalance(address(dai)), 50_000e18);
    }

    function test_deposit_non_owner_reverts() public {
        vm.prank(RANDOM);
        vm.expectRevert(AgentVault.NotOwner.selector);
        vault.deposit(address(usdc), 1000e6);
    }

    function test_deposit_zero_amount_reverts() public {
        vm.prank(OWNER);
        vm.expectRevert(AgentVault.ZeroAmount.selector);
        vault.deposit(address(usdc), 0);
    }

    // ===== Test: Deposit ETH =====

    function test_deposit_eth() public {
        vm.prank(OWNER);
        vault.depositETH{value: 1 ether}();
        assertEq(vault.vaultBalance(NATIVE_ETH), 1 ether);
    }

    function test_deposit_eth_via_receive() public {
        vm.prank(OWNER);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(vault.vaultBalance(NATIVE_ETH), 1 ether);
    }

    // ===== Test: Withdraw =====

    function test_withdraw_partial() public {
        _depositUSDC(10_000e6);

        vm.prank(OWNER);
        vault.withdraw(address(usdc), 3_000e6);
        assertEq(vault.vaultBalance(address(usdc)), 7_000e6);
    }

    function test_withdraw_full() public {
        _depositUSDC(10_000e6);

        vm.prank(OWNER);
        vault.withdraw(address(usdc), 10_000e6);
        assertEq(vault.vaultBalance(address(usdc)), 0);
    }

    function test_withdraw_eth() public {
        vm.prank(OWNER);
        vault.depositETH{value: 5 ether}();

        uint256 ownerBalBefore = OWNER.balance;
        vm.prank(OWNER);
        vault.withdraw(NATIVE_ETH, 2 ether);
        assertEq(OWNER.balance, ownerBalBefore + 2 ether);
        assertEq(vault.vaultBalance(NATIVE_ETH), 3 ether);
    }

    function test_withdraw_insufficient_reverts() public {
        _depositUSDC(100e6);

        vm.prank(OWNER);
        vm.expectRevert(AgentVault.InsufficientBalance.selector);
        vault.withdraw(address(usdc), 200e6);
    }

    function test_withdraw_non_owner_reverts() public {
        _depositUSDC(10_000e6);

        vm.prank(RANDOM);
        vm.expectRevert(AgentVault.NotOwner.selector);
        vault.withdraw(address(usdc), 1000e6);
    }

    // ===== Test: Add/Remove Agent =====

    function test_add_agent() public {
        _setupAgent();
        assertTrue(vault.isAgentActive(AGENT));
    }

    function test_add_agent_duplicate_reverts() public {
        _setupAgent();

        vm.prank(OWNER);
        vm.expectRevert(AgentVault.AgentAlreadyActive.selector);
        vault.addAgent(AGENT);
    }

    function test_remove_agent() public {
        _setupAgent();

        vm.prank(OWNER);
        vault.removeAgent(AGENT);
        assertFalse(vault.isAgentActive(AGENT));
    }

    function test_remove_inactive_agent_reverts() public {
        vm.prank(OWNER);
        vm.expectRevert(AgentVault.AgentNotActive.selector);
        vault.removeAgent(AGENT);
    }

    function test_readd_agent() public {
        _setupAgent();

        vm.prank(OWNER);
        vault.removeAgent(AGENT);
        assertFalse(vault.isAgentActive(AGENT));

        vm.prank(OWNER);
        vault.addAgent(AGENT);
        assertTrue(vault.isAgentActive(AGENT));
    }

    // ===== Test: Set Spend Policy =====

    function test_set_spend_policy() public {
        _setupAgent();
        _setupPolicy();

        AgentVault.SpendPolicy memory p = vault.getSpendPolicy(AGENT, address(usdc));
        assertTrue(p.exists);
        assertEq(p.maxPerTx, 1000e6);
        assertEq(p.totalPerPeriod, 5000e6);
        assertEq(p.maxTxPerPeriod, 10);
        assertEq(p.periodSeconds, 30 days);
    }

    function test_set_policy_inactive_agent_reverts() public {
        vm.prank(OWNER);
        vm.expectRevert(AgentVault.AgentNotActive.selector);
        vault.setSpendPolicy(AGENT, address(usdc), 1000e6, 5000e6, 10, 30 days);
    }

    function test_remove_spend_policy() public {
        _setupAgent();
        _setupPolicy();

        vm.prank(OWNER);
        vault.removeSpendPolicy(AGENT, address(usdc));

        AgentVault.SpendPolicy memory p = vault.getSpendPolicy(AGENT, address(usdc));
        assertFalse(p.exists);
    }

    // ===== Test: Execute Payment Happy Path =====

    function test_execute_payment() public {
        _fullSetup();

        vm.prank(AGENT);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);

        assertEq(vault.vaultBalance(address(usdc)), 9_500e6);
        assertEq(usdc.balanceOf(RECIPIENT), 500e6);
    }

    function test_execute_payment_eth() public {
        vm.prank(OWNER);
        vault.depositETH{value: 10 ether}();
        _setupAgent();

        vm.prank(OWNER);
        vault.setSpendPolicy(AGENT, NATIVE_ETH, 2 ether, 10 ether, 10, 30 days);

        uint256 recipientBefore = RECIPIENT.balance;
        vm.prank(AGENT);
        vault.executePayment(NATIVE_ETH, RECIPIENT, 1 ether);

        assertEq(vault.vaultBalance(NATIVE_ETH), 9 ether);
        assertEq(RECIPIENT.balance, recipientBefore + 1 ether);
    }

    // ===== Test: Execute Payment — Revoked Agent =====

    function test_execute_payment_revoked_agent_reverts() public {
        _fullSetup();

        vm.prank(OWNER);
        vault.removeAgent(AGENT);

        vm.prank(AGENT);
        vm.expectRevert(AgentVault.NotAuthorized.selector);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);
    }

    // ===== Test: Execute Payment — Paused Vault =====

    function test_execute_payment_paused_reverts() public {
        _fullSetup();

        vm.prank(OWNER);
        vault.pause();

        vm.prank(AGENT);
        vm.expectRevert(AgentVault.VaultIsPaused.selector);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);
    }

    // ===== Test: Execute Payment — Exceeds Max Per Tx =====

    function test_execute_payment_exceeds_max_per_tx_reverts() public {
        _fullSetup();

        vm.prank(AGENT);
        vm.expectRevert(AgentVault.ExceedsMaxPerTx.selector);
        vault.executePayment(address(usdc), RECIPIENT, 1500e6); // max is 1000e6
    }

    // ===== Test: Execute Payment — Exceeds Period Total =====

    function test_execute_payment_exceeds_period_total_reverts() public {
        _fullSetup();

        // Spend 5 * 1000 = 5000 (at limit)
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(AGENT);
            vault.executePayment(address(usdc), RECIPIENT, 1000e6);
        }

        // 6th should fail
        vm.prank(AGENT);
        vm.expectRevert(AgentVault.ExceedsPeriodLimit.selector);
        vault.executePayment(address(usdc), RECIPIENT, 1);
    }

    // ===== Test: Execute Payment — Exceeds Tx Count =====

    function test_execute_payment_exceeds_tx_count_reverts() public {
        _fullSetup();

        // Execute 10 small payments (at limit)
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(AGENT);
            vault.executePayment(address(usdc), RECIPIENT, 100e6);
        }

        // 11th should fail
        vm.prank(AGENT);
        vm.expectRevert(AgentVault.ExceedsTxCount.selector);
        vault.executePayment(address(usdc), RECIPIENT, 100e6);
    }

    // ===== Test: Execute Payment — Insufficient Balance =====

    function test_execute_payment_insufficient_balance_reverts() public {
        _depositUSDC(100e6); // only 100
        _setupAgent();
        _setupPolicy();

        vm.prank(AGENT);
        vm.expectRevert(AgentVault.InsufficientBalance.selector);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);
    }

    // ===== Test: Execute Payment — Zero Amount =====

    function test_execute_payment_zero_amount_reverts() public {
        _fullSetup();

        vm.prank(AGENT);
        vm.expectRevert(AgentVault.ZeroAmount.selector);
        vault.executePayment(address(usdc), RECIPIENT, 0);
    }

    // ===== Test: Execute Payment — No Policy =====

    function test_execute_payment_no_policy_reverts() public {
        _depositUSDC(10_000e6);
        _setupAgent();
        // No policy set for DAI

        vm.prank(AGENT);
        vm.expectRevert(AgentVault.NoPolicySet.selector);
        vault.executePayment(address(dai), RECIPIENT, 100e18);
    }

    // ===== Test: Pause/Unpause =====

    function test_pause_unpause() public {
        _fullSetup();

        vm.prank(OWNER);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(OWNER);
        vault.unpause();
        assertFalse(vault.paused());

        // Should work after unpause
        vm.prank(AGENT);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);
        assertEq(vault.vaultBalance(address(usdc)), 9_500e6);
    }

    // ===== Test: Period Reset =====

    function test_period_reset() public {
        _fullSetup();

        // Spend to the limit
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(AGENT);
            vault.executePayment(address(usdc), RECIPIENT, 1000e6);
        }

        // Should fail at limit
        vm.prank(AGENT);
        vm.expectRevert(AgentVault.ExceedsPeriodLimit.selector);
        vault.executePayment(address(usdc), RECIPIENT, 1);

        // Advance time past period
        vm.warp(block.timestamp + 30 days + 1);

        // Should work again
        vm.prank(AGENT);
        vault.executePayment(address(usdc), RECIPIENT, 1000e6);
        // 10_000 - 5*1000 - 1000 = 4_000
        assertEq(vault.vaultBalance(address(usdc)), 4_000e6);
    }

    // ===== Test: Multi-Token Policies =====

    function test_multi_token_payments() public {
        _depositUSDC(10_000e6);

        vm.startPrank(OWNER);
        dai.approve(address(vault), 50_000e18);
        vault.deposit(address(dai), 50_000e18);
        vault.addAgent(AGENT);
        vault.setSpendPolicy(AGENT, address(usdc), 1000e6, 5000e6, 10, 30 days);
        vault.setSpendPolicy(AGENT, address(dai), 2000e18, 10_000e18, 5, 30 days);
        vm.stopPrank();

        vm.prank(AGENT);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);
        assertEq(vault.vaultBalance(address(usdc)), 9_500e6);

        vm.prank(AGENT);
        vault.executePayment(address(dai), RECIPIENT, 1500e18);
        assertEq(vault.vaultBalance(address(dai)), 48_500e18);
    }

    // ===== Test: Owner Withdraw During Active Agent =====

    function test_owner_withdraw_during_active_agent() public {
        _fullSetup();

        // Owner withdraws most funds
        vm.prank(OWNER);
        vault.withdraw(address(usdc), 9_000e6);
        assertEq(vault.vaultBalance(address(usdc)), 1_000e6);

        // Agent can still pay from remaining balance
        vm.prank(AGENT);
        vault.executePayment(address(usdc), RECIPIENT, 500e6);
        assertEq(vault.vaultBalance(address(usdc)), 500e6);
    }
}
