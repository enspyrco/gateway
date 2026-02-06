/**
 * Test reserving a token ID
 * Run with: npx hardhat run scripts/check-reserve.js --network localhost
 * Outputs: RESERVE_OK or RESERVE_FAIL
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contract = await ethers.getContractAt("NFTmarketNFT", deployment.address);

  try {
    const tx = await contract.reserveTokenId();
    await tx.wait();
    console.log("RESERVE_OK");
  } catch (e) {
    console.log("RESERVE_FAIL:", e.message);
  }
}

main().catch((e) => console.log("RESERVE_FAIL:", e.message));
