const hre = require("hardhat");

// USDC contract addresses
const USDC_ADDRESSES = {
  polygon: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",  // Native USDC on Polygon
  mumbai: "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23",   // Test USDC on Mumbai
  localhost: null,  // Will deploy mock
  hardhat: null,    // Will deploy mock
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("Deploying NFTmarketPayments with account:", deployer.address);
  console.log("Network:", network);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  let usdcAddress = USDC_ADDRESSES[network];

  // Deploy mock USDC for local testing
  if (!usdcAddress) {
    console.log("\nDeploying mock USDC for local testing...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const mockUsdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log("Mock USDC deployed to:", usdcAddress);

    // Mint some USDC to deployer for testing
    await mockUsdc.mint(deployer.address, hre.ethers.parseUnits("10000", 6));
    console.log("Minted 10,000 USDC to deployer");
  }

  console.log("\nDeploying NFTmarketPayments...");
  const NFTmarketPayments = await hre.ethers.getContractFactory("NFTmarketPayments");
  const payments = await NFTmarketPayments.deploy(usdcAddress);
  await payments.waitForDeployment();

  const paymentsAddress = await payments.getAddress();
  console.log("NFTmarketPayments deployed to:", paymentsAddress);
  console.log("USDC address:", usdcAddress);

  // Log fee structure
  const [gen1, gen4, mint] = await payments.getFees();
  console.log("\nFee structure:");
  console.log("  - 1 image generation:", hre.ethers.formatUnits(gen1, 6), "USDC");
  console.log("  - 4 image generation:", hre.ethers.formatUnits(gen4, 6), "USDC");
  console.log("  - NFT minting:", hre.ethers.formatUnits(mint, 6), "USDC");

  // Verify on Etherscan/Polygonscan (if not localhost)
  if (network !== "localhost" && network !== "hardhat") {
    console.log("\nWaiting for block confirmations...");
    await payments.deploymentTransaction().wait(6);

    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: paymentsAddress,
        constructorArguments: [usdcAddress],
      });
      console.log("Contract verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }

  // Output for .env file
  console.log("\n=== Add to .env ===");
  console.log(`PAYMENT_CONTRACT_ADDRESS=${paymentsAddress}`);
  if (!USDC_ADDRESSES[network]) {
    console.log(`MOCK_USDC_ADDRESS=${usdcAddress}`);
  }

  return { paymentsAddress, usdcAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
