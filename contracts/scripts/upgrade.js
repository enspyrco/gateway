/**
 * Upgrade Script
 *
 * Upgrades the UUPS proxy to a new implementation. Validates storage layout
 * compatibility before upgrading.
 *
 * Usage:
 *   npx hardhat run scripts/upgrade.js --network localhost
 *   npx hardhat run scripts/upgrade.js --network polygon
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Load deployment info
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment.json found. Deploy first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const proxyAddress = deployment.proxyAddress || deployment.address;

  console.log("Upgrading NFTmarketNFT...");
  console.log("  Deployer:", deployer.address);
  console.log("  Proxy:", proxyAddress);
  console.log("  Network:", hre.network.name);
  console.log("  Previous implementation:", deployment.implementationAddress);

  const NFTmarketNFT = await hre.ethers.getContractFactory(
    "contracts/NFTmarketNFT.sol:NFTmarketNFT"
  );

  // upgradeProxy validates storage layout automatically
  console.log("\nValidating and upgrading...");
  const upgraded = await hre.upgrades.upgradeProxy(proxyAddress, NFTmarketNFT, {
    kind: "uups",
  });

  await upgraded.waitForDeployment();

  const newImplementation = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\n✅ Upgrade successful!");
  console.log("  Proxy (unchanged):", proxyAddress);
  console.log("  New implementation:", newImplementation);

  // Update deployment.json
  deployment.implementationAddress = newImplementation;
  deployment.upgradedAt = new Date().toISOString();
  deployment.upgradedBy = deployer.address;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\nUpdated deployment.json");

  // Verify on explorer if not localhost
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("\nVerifying new implementation...");
    try {
      await hre.run("verify:verify", {
        address: newImplementation,
        constructorArguments: [],
      });
      console.log("✅ New implementation verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
