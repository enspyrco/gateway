/**
 * Check if minter is registered
 * Run with: npx hardhat run scripts/check-minter.js --network localhost
 * Outputs: MINTER_OK or MINTER_FAIL
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contract = await ethers.getContractAt("NFTmarketNFT", deployment.address);
  const [, isMinter] = await contract.getMinterAuthority("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  console.log(isMinter ? "MINTER_OK" : "MINTER_FAIL");
}

main().catch(() => console.log("MINTER_FAIL"));
