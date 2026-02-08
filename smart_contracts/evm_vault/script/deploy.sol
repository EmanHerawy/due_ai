// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentVaultFactory.sol";

contract DeployAgentVaultFactory is Script {
    function run() external {
        // Load deployer private key from env
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deploying with address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        AgentVaultFactory factory = new AgentVaultFactory();

        vm.stopBroadcast();

        console2.log("AgentVaultFactory deployed at:", address(factory));
    }
}
