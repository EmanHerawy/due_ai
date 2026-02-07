// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentVault} from "./AgentVault.sol";

/// @title AgentVaultFactory
/// @notice Deploys AgentVault instances. One vault per user, multi-token within each vault.
contract AgentVaultFactory {
    event VaultCreated(address indexed vault, address indexed owner);

    mapping(address owner => address vault) public vaults;

    error VaultAlreadyExists();

    /// @notice Create a new vault for the caller
    /// @return vault The address of the deployed vault
    function createVault() external returns (address vault) {
        if (vaults[msg.sender] != address(0)) revert VaultAlreadyExists();

        AgentVault v = new AgentVault(msg.sender);
        vault = address(v);
        vaults[msg.sender] = vault;

        emit VaultCreated(vault, msg.sender);
    }
}
