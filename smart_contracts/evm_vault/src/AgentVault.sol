// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentVault
/// @notice Non-custodial multi-token vault that delegates spending authority to AI agents
///         within on-chain guardrails. Direct port of the Sui Move vault to EVM.
///
///      Key differences from the Sui version:
///      - No capability objects — agents are addresses checked via mapping (msg.sender)
///      - Multi-token via ERC-20 addresses instead of Move generics + Bag
///      - block.timestamp instead of Sui Clock
///      - ReentrancyGuard for external call safety
///      - Native ETH supported via NATIVE_ETH sentinel address
contract AgentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ===== Constants =====

    /// @dev Sentinel address representing native ETH
    address public constant NATIVE_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // ===== Errors =====

    error NotOwner();
    error NotAuthorized();
    error NoPolicySet();
    error VaultIsPaused();
    error ExceedsMaxPerTx();
    error ExceedsPeriodLimit();
    error ExceedsTxCount();
    error InsufficientBalance();
    error AgentAlreadyActive();
    error ZeroAmount();
    error AgentNotActive();
    error ZeroAddress();
    error EthTransferFailed();

    // ===== Structs =====

    struct SpendPolicy {
        uint256 maxPerTx;
        uint256 totalPerPeriod;
        uint256 maxTxPerPeriod;
        uint256 periodSeconds;
        uint256 periodStart;
        uint256 spentThisPeriod;
        uint256 txCountThisPeriod;
        bool exists;
    }

    // ===== State =====

    address public immutable owner;
    bool public paused;
    uint256 public createdAt;

    mapping(address agent => bool) public activeAgents;
    /// @dev agent => token => SpendPolicy
    mapping(address agent => mapping(address token => SpendPolicy)) internal _policies;

    // ===== Events =====

    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);
    event PolicySet(
        address indexed agent,
        address indexed token,
        uint256 maxPerTx,
        uint256 totalPerPeriod,
        uint256 maxTxPerPeriod,
        uint256 periodSeconds
    );
    event PolicyRemoved(address indexed agent, address indexed token);
    event PaymentExecuted(
        address indexed agent,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event VaultPaused();
    event VaultUnpaused();

    // ===== Modifiers =====

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyActiveAgent() {
        if (!activeAgents[msg.sender]) revert NotAuthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert VaultIsPaused();
        _;
    }

    // ===== Constructor =====

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        createdAt = block.timestamp;
    }

    /// @dev Accept native ETH deposits directly
    receive() external payable {
        emit Deposited(NATIVE_ETH, msg.value);
    }

    // ===== Owner Functions =====

    /// @notice Deposit ERC-20 tokens into the vault
    /// @param token The ERC-20 token address
    /// @param amount Amount to deposit (caller must have approved this contract)
    function deposit(address token, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount);
    }

    /// @notice Deposit native ETH into the vault
    function depositETH() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(NATIVE_ETH, msg.value);
    }

    /// @notice Withdraw tokens back to the owner
    /// @param token The token address (use NATIVE_ETH for ETH)
    /// @param amount Amount to withdraw
    function withdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();

        if (token == NATIVE_ETH) {
            if (address(this).balance < amount) revert InsufficientBalance();
            (bool success,) = owner.call{value: amount}("");
            if (!success) revert EthTransferFailed();
        } else {
            if (IERC20(token).balanceOf(address(this)) < amount) revert InsufficientBalance();
            IERC20(token).safeTransfer(owner, amount);
        }

        emit Withdrawn(token, amount);
    }

    /// @notice Add an agent to the active set
    function addAgent(address agent) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (activeAgents[agent]) revert AgentAlreadyActive();
        activeAgents[agent] = true;
        emit AgentAdded(agent);
    }

    /// @notice Remove an agent from the active set. Policy data remains but is unenforceable.
    function removeAgent(address agent) external onlyOwner {
        if (!activeAgents[agent]) revert AgentNotActive();
        activeAgents[agent] = false;
        emit AgentRemoved(agent);
    }

    /// @notice Set or update a spend policy for an agent + token pair
    /// @param agent The agent address (must be active)
    /// @param token The token address (use NATIVE_ETH for ETH)
    function setSpendPolicy(
        address agent,
        address token,
        uint256 maxPerTx,
        uint256 totalPerPeriod,
        uint256 maxTxPerPeriod,
        uint256 periodSeconds
    ) external onlyOwner {
        if (!activeAgents[agent]) revert AgentNotActive();

        _policies[agent][token] = SpendPolicy({
            maxPerTx: maxPerTx,
            totalPerPeriod: totalPerPeriod,
            maxTxPerPeriod: maxTxPerPeriod,
            periodSeconds: periodSeconds,
            periodStart: block.timestamp,
            spentThisPeriod: 0,
            txCountThisPeriod: 0,
            exists: true
        });

        emit PolicySet(agent, token, maxPerTx, totalPerPeriod, maxTxPerPeriod, periodSeconds);
    }

    /// @notice Remove a spend policy for an agent + token pair
    function removeSpendPolicy(address agent, address token) external onlyOwner {
        if (!_policies[agent][token].exists) revert NoPolicySet();
        delete _policies[agent][token];
        emit PolicyRemoved(agent, token);
    }

    /// @notice Pause all agent operations (emergency stop)
    function pause() external onlyOwner {
        paused = true;
        emit VaultPaused();
    }

    /// @notice Unpause agent operations
    function unpause() external onlyOwner {
        paused = false;
        emit VaultUnpaused();
    }

    // ===== Agent Functions =====

    /// @notice Execute a payment from the vault to a recipient
    /// @param token The token to send (use NATIVE_ETH for ETH)
    /// @param recipient The payment recipient
    /// @param amount The amount in token's smallest unit
    function executePayment(
        address token,
        address recipient,
        uint256 amount
    ) external whenNotPaused onlyActiveAgent nonReentrant {
        // 1. Basic validation
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        // 2. Look up SpendPolicy
        SpendPolicy storage policy = _policies[msg.sender][token];
        if (!policy.exists) revert NoPolicySet();

        // 3. Lazy period reset
        if (block.timestamp >= policy.periodStart + policy.periodSeconds) {
            policy.spentThisPeriod = 0;
            policy.txCountThisPeriod = 0;
            policy.periodStart = block.timestamp;
        }

        // 4. Spending limit checks
        if (amount > policy.maxPerTx) revert ExceedsMaxPerTx();
        if (policy.spentThisPeriod + amount > policy.totalPerPeriod) revert ExceedsPeriodLimit();
        if (policy.txCountThisPeriod + 1 > policy.maxTxPerPeriod) revert ExceedsTxCount();

        // 5. Balance check + transfer
        if (token == NATIVE_ETH) {
            if (address(this).balance < amount) revert InsufficientBalance();
            (bool success,) = recipient.call{value: amount}("");
            if (!success) revert EthTransferFailed();
        } else {
            if (IERC20(token).balanceOf(address(this)) < amount) revert InsufficientBalance();
            IERC20(token).safeTransfer(recipient, amount);
        }

        // 6. Update accounting (after transfer — checks-effects-interactions with reentrancy guard)
        policy.spentThisPeriod += amount;
        policy.txCountThisPeriod += 1;

        emit PaymentExecuted(msg.sender, token, recipient, amount);
    }

    // ===== View Functions =====

    /// @notice Get the vault's balance of a token
    function vaultBalance(address token) external view returns (uint256) {
        if (token == NATIVE_ETH) return address(this).balance;
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Get the spend policy for an agent + token pair
    function getSpendPolicy(
        address agent,
        address token
    ) external view returns (SpendPolicy memory) {
        return _policies[agent][token];
    }

    /// @notice Check if an agent is active
    function isAgentActive(address agent) external view returns (bool) {
        return activeAgents[agent];
    }
}
