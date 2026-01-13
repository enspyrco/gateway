const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Use deployer as platform wallet for now (change in production)
  const platformWallet = process.env.PLATFORM_WALLET || deployer.address;

  const NFTmarketNFT = await hre.ethers.getContractFactory("NFTmarketNFT");
  const nftmarket = await NFTmarketNFT.deploy(platformWallet);

  await nftmarket.waitForDeployment();

  const address = await nftmarket.getAddress();

  console.log("NFTmarketNFT deployed to:", address);
  console.log("Platform wallet:", platformWallet);

  // Verify on Etherscan/Polygonscan (if not localhost)
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("Waiting for block confirmations...");
    await nftmarket.deploymentTransaction().wait(6);

    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [platformWallet],
      });
      console.log("Contract verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
