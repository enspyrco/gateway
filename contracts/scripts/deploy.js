const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Configuration
  // - owner: Can register new authorities and upgrade the contract
  // - defaultAdmin: Admin for Authority 0 (can add/remove minters for your platform)
  // - defaultFeeBps: Fee for Authority 0 (250 = 2.5%)
  const owner = process.env.CONTRACT_OWNER || deployer.address;
  const defaultAdmin = process.env.DEFAULT_AUTHORITY_ADMIN || deployer.address;
  const defaultFeeBps = process.env.DEFAULT_FEE_BPS || 250; // 2.5%

  console.log("\nDeployment configuration:");
  console.log("  Owner (can upgrade & register authorities):", owner);
  console.log("  Authority 0 Admin (can add/remove minters):", defaultAdmin);
  console.log("  Authority 0 Fee:", defaultFeeBps, "bps (", defaultFeeBps / 100, "%)");

  // Deploy using UUPS proxy pattern
  const NFTmarketNFT = await hre.ethers.getContractFactory("contracts/NFTmarketNFT.sol:NFTmarketNFT");

  console.log("\nDeploying NFTmarketNFT via UUPS proxy...");

  const nftmarket = await hre.upgrades.deployProxy(
    NFTmarketNFT,
    [owner, defaultAdmin, defaultFeeBps],
    {
      kind: 'uups',
      initializer: 'initialize'
    }
  );

  await nftmarket.waitForDeployment();

  const proxyAddress = await nftmarket.getAddress();
  const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\n✅ Deployment successful!");
  console.log("  Proxy address:", proxyAddress);
  console.log("  Implementation address:", implementationAddress);

  // Verify Authority 0 was created
  const [authAdmin, authFeeBps, authIsActive] = await nftmarket.getAuthority(0);
  console.log("\nAuthority 0 created:");
  console.log("  Admin:", authAdmin);
  console.log("  Fee:", authFeeBps.toString(), "bps");
  console.log("  Active:", authIsActive);

  // Write deployed addresses to file for other services to read
  const deploymentInfo = {
    // Primary address to use (the proxy)
    address: proxyAddress,
    proxyAddress,
    implementationAddress,
    // Authority 0 info
    defaultAuthorityId: 0,
    defaultAdmin,
    defaultFeeBps: Number(defaultFeeBps),
    // Deployment metadata
    owner,
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    version: "2.0.0"
  };

  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info written to:", deploymentPath);

  // Verify on Etherscan/Polygonscan (if not localhost)
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("\nWaiting for block confirmations...");
    await nftmarket.deploymentTransaction().wait(6);

    console.log("Verifying implementation contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: implementationAddress,
        constructorArguments: [],
      });
      console.log("✅ Implementation contract verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }

  console.log("\n📋 Next steps:");
  console.log("1. Add minters to Authority 0:");
  console.log(`   await nftmarket.addMinter(0, "${deployer.address}")`);
  console.log("2. Register partner authorities:");
  console.log('   await nftmarket.registerAuthority(partnerAdmin, 300) // 3% fee');

  return proxyAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
