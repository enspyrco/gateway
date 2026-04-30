/**
 * Validate Upgrade Script
 *
 * Validates that a new implementation contract is storage-layout compatible
 * with the currently deployed proxy. Run this before any mainnet upgrade.
 *
 * Usage:
 *   npx hardhat run scripts/validate-upgrade.js --network localhost
 *   npx hardhat run scripts/validate-upgrade.js --network polygon
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info to get current proxy address
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment.json found. Deploy first with: npm run deploy:local");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const proxyAddress = deployment.proxyAddress || deployment.address;

  console.log("Validating upgrade compatibility...");
  console.log("  Proxy address:", proxyAddress);
  console.log("  Network:", hre.network.name);

  // Get the new implementation contract factory
  const NFTmarketNFT = await hre.ethers.getContractFactory(
    "contracts/NFTmarketNFT.sol:NFTmarketNFT"
  );

  try {
    // validateUpgrade checks:
    // 1. Storage layout compatibility (no reordering, no removed fields)
    // 2. __gap array correctness
    // 3. Initializer safety
    await hre.upgrades.validateUpgrade(proxyAddress, NFTmarketNFT, {
      kind: "uups",
    });

    console.log("\n✅ Upgrade validation PASSED");
    console.log("   Storage layout is compatible with the deployed proxy.");
    console.log("   Safe to upgrade.");
  } catch (error) {
    console.error("\n❌ Upgrade validation FAILED");
    console.error("   " + error.message);
    console.error("\n   DO NOT upgrade the proxy. Fix the storage layout first.");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
