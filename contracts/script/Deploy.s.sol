// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NFTLicensingSystem} from "../src/NFTLicensingSystem.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public returns (NFTLicensingSystem) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        NFTLicensingSystem nft = new NFTLicensingSystem();

        console.log("NFTLicensingSystem deployed at:", address(nft));

        vm.stopBroadcast();

        return nft;
    }
}
