/**
 * Setup minter for the deployed contract
 * Run with: npx hardhat run scripts/setup-minter.js --network localhost
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployment.json not found - deploy the contract first");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log("Contract address:", deployment.address);

  // Get contract
  const contract = await ethers.getContractAt("NFTmarketNFT", deployment.address);

  // Minter address (Hardhat account #0 - used by backend)
  const minterAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  // Check if already registered
  const [authorityId, isMinter] = await contract.getMinterAuthority(minterAddress);

  if (isMinter) {
    console.log(`Minter ${minterAddress} already registered (authority ${authorityId})`);
    return;
  }

  // Add minter
  console.log(`Adding minter ${minterAddress}...`);
  const tx = await contract.addMinter(0, minterAddress);
  await tx.wait();

  // Verify
  const [newAuthorityId, newIsMinter] = await contract.getMinterAuthority(minterAddress);
  if (newIsMinter) {
    console.log(`✅ Minter registered successfully (authority ${newAuthorityId})`);
  } else {
    throw new Error("Failed to register minter");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
