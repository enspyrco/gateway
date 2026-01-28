const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTmarketPayments", function () {
  let payments;
  let mockUsdc;
  let owner, user1, user2, platform;

  // USDC has 6 decimals
  const USDC_DECIMALS = 6;
  const parseUSDC = (amount) => ethers.parseUnits(amount, USDC_DECIMALS);

  // Default fees
  const GENERATION_FEE_1 = parseUSDC("0.50");   // $0.50
  const GENERATION_FEE_4 = parseUSDC("1.50");   // $1.50
  const MINT_FEE = parseUSDC("1.00");           // $1.00

  beforeEach(async function () {
    [owner, user1, user2, platform] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await MockERC20.deploy("USD Coin", "USDC", USDC_DECIMALS);
    await mockUsdc.waitForDeployment();

    // Deploy payments contract
    const NFTmarketPayments = await ethers.getContractFactory("NFTmarketPayments");
    payments = await NFTmarketPayments.deploy(await mockUsdc.getAddress());
    await payments.waitForDeployment();

    // Mint USDC to users for testing
    await mockUsdc.mint(user1.address, parseUSDC("1000"));
    await mockUsdc.mint(user2.address, parseUSDC("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct USDC address", async function () {
      expect(await payments.usdc()).to.equal(await mockUsdc.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await payments.owner()).to.equal(owner.address);
    });

    it("Should set default fees correctly", async function () {
      const [gen1, gen4, mint] = await payments.getFees();
      expect(gen1).to.equal(GENERATION_FEE_1);
      expect(gen4).to.equal(GENERATION_FEE_4);
      expect(mint).to.equal(MINT_FEE);
    });

    it("Should revert if USDC address is zero", async function () {
      const NFTmarketPayments = await ethers.getContractFactory("NFTmarketPayments");
      await expect(
        NFTmarketPayments.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(payments, "InvalidUSDCAddress");
    });
  });

  describe("Generation Payments", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("gen-payment-1"));

    beforeEach(async function () {
      // Approve USDC spending
      await mockUsdc.connect(user1).approve(
        await payments.getAddress(),
        parseUSDC("100")
      );
    });

    it("Should accept payment for 1 image generation", async function () {
      const tx = await payments.connect(user1).payForGeneration(paymentId, 1);

      await expect(tx)
        .to.emit(payments, "GenerationPaid")
        .withArgs(user1.address, paymentId, GENERATION_FEE_1, 1);

      // Check payment is recorded
      expect(await payments.verifyPayment(paymentId)).to.be.true;

      // Check USDC was transferred
      expect(await mockUsdc.balanceOf(await payments.getAddress()))
        .to.equal(GENERATION_FEE_1);

      // Check accumulated fees
      expect(await payments.accumulatedFees()).to.equal(GENERATION_FEE_1);
    });

    it("Should accept payment for 4 image generation", async function () {
      const tx = await payments.connect(user1).payForGeneration(paymentId, 4);

      await expect(tx)
        .to.emit(payments, "GenerationPaid")
        .withArgs(user1.address, paymentId, GENERATION_FEE_4, 4);

      expect(await payments.verifyPayment(paymentId)).to.be.true;
      expect(await mockUsdc.balanceOf(await payments.getAddress()))
        .to.equal(GENERATION_FEE_4);
    });

    it("Should reject invalid image count", async function () {
      await expect(
        payments.connect(user1).payForGeneration(paymentId, 2)
      ).to.be.revertedWithCustomError(payments, "InvalidImageCount");

      await expect(
        payments.connect(user1).payForGeneration(paymentId, 0)
      ).to.be.revertedWithCustomError(payments, "InvalidImageCount");
    });

    it("Should reject duplicate payment ID", async function () {
      await payments.connect(user1).payForGeneration(paymentId, 1);

      await expect(
        payments.connect(user1).payForGeneration(paymentId, 1)
      ).to.be.revertedWithCustomError(payments, "PaymentAlreadyProcessed");
    });

    it("Should reject zero payment ID", async function () {
      await expect(
        payments.connect(user1).payForGeneration(ethers.ZeroHash, 1)
      ).to.be.revertedWithCustomError(payments, "InvalidPaymentId");
    });

    it("Should reject if insufficient allowance", async function () {
      // Revoke approval
      await mockUsdc.connect(user1).approve(await payments.getAddress(), 0);

      await expect(
        payments.connect(user1).payForGeneration(paymentId, 1)
      ).to.be.revertedWithCustomError(payments, "InsufficientAllowance");
    });

    it("Should handle multiple payments from same user", async function () {
      const paymentId2 = ethers.keccak256(ethers.toUtf8Bytes("gen-payment-2"));

      await payments.connect(user1).payForGeneration(paymentId, 1);
      await payments.connect(user1).payForGeneration(paymentId2, 4);

      expect(await payments.verifyPayment(paymentId)).to.be.true;
      expect(await payments.verifyPayment(paymentId2)).to.be.true;
      expect(await payments.accumulatedFees())
        .to.equal(GENERATION_FEE_1 + GENERATION_FEE_4);
    });
  });

  describe("Mint Payments", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("mint-payment-1"));

    beforeEach(async function () {
      await mockUsdc.connect(user1).approve(
        await payments.getAddress(),
        parseUSDC("100")
      );
    });

    it("Should accept payment for minting", async function () {
      const tx = await payments.connect(user1).payForMint(paymentId);

      await expect(tx)
        .to.emit(payments, "MintPaid")
        .withArgs(user1.address, paymentId, MINT_FEE);

      expect(await payments.verifyPayment(paymentId)).to.be.true;
      expect(await mockUsdc.balanceOf(await payments.getAddress()))
        .to.equal(MINT_FEE);
    });

    it("Should reject duplicate payment ID", async function () {
      await payments.connect(user1).payForMint(paymentId);

      await expect(
        payments.connect(user1).payForMint(paymentId)
      ).to.be.revertedWithCustomError(payments, "PaymentAlreadyProcessed");
    });

    it("Should reject zero payment ID", async function () {
      await expect(
        payments.connect(user1).payForMint(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(payments, "InvalidPaymentId");
    });

    it("Should reject if insufficient allowance", async function () {
      await mockUsdc.connect(user1).approve(await payments.getAddress(), 0);

      await expect(
        payments.connect(user1).payForMint(paymentId)
      ).to.be.revertedWithCustomError(payments, "InsufficientAllowance");
    });
  });

  describe("View Functions", function () {
    it("Should return correct fee for image count", async function () {
      expect(await payments.getFeeFor(0)).to.equal(MINT_FEE);
      expect(await payments.getFeeFor(1)).to.equal(GENERATION_FEE_1);
      expect(await payments.getFeeFor(4)).to.equal(GENERATION_FEE_4);
    });

    it("Should revert getFeeFor with invalid count", async function () {
      await expect(payments.getFeeFor(2))
        .to.be.revertedWithCustomError(payments, "InvalidImageCount");
    });

    it("Should return false for unprocessed payment", async function () {
      const randomId = ethers.keccak256(ethers.toUtf8Bytes("random"));
      expect(await payments.verifyPayment(randomId)).to.be.false;
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update fees", async function () {
      const newGen1 = parseUSDC("0.75");
      const newGen4 = parseUSDC("2.00");
      const newMint = parseUSDC("1.50");

      await expect(payments.connect(owner).setFees(newGen1, newGen4, newMint))
        .to.emit(payments, "FeesUpdated")
        .withArgs(newGen1, newGen4, newMint);

      const [gen1, gen4, mint] = await payments.getFees();
      expect(gen1).to.equal(newGen1);
      expect(gen4).to.equal(newGen4);
      expect(mint).to.equal(newMint);
    });

    it("Should not allow non-owner to update fees", async function () {
      await expect(
        payments.connect(user1).setFees(parseUSDC("1"), parseUSDC("2"), parseUSDC("3"))
      ).to.be.revertedWithCustomError(payments, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to withdraw fees", async function () {
      // Make a payment first
      await mockUsdc.connect(user1).approve(await payments.getAddress(), parseUSDC("10"));
      await payments.connect(user1).payForMint(
        ethers.keccak256(ethers.toUtf8Bytes("payment"))
      );

      const balanceBefore = await mockUsdc.balanceOf(owner.address);

      await expect(payments.connect(owner).withdrawFees())
        .to.emit(payments, "FeesWithdrawn")
        .withArgs(owner.address, MINT_FEE);

      const balanceAfter = await mockUsdc.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(MINT_FEE);
      expect(await payments.accumulatedFees()).to.equal(0);
    });

    it("Should allow owner to withdraw fees to specific address", async function () {
      await mockUsdc.connect(user1).approve(await payments.getAddress(), parseUSDC("10"));
      await payments.connect(user1).payForMint(
        ethers.keccak256(ethers.toUtf8Bytes("payment"))
      );

      const balanceBefore = await mockUsdc.balanceOf(platform.address);

      await expect(payments.connect(owner).withdrawFeesTo(platform.address))
        .to.emit(payments, "FeesWithdrawn")
        .withArgs(platform.address, MINT_FEE);

      const balanceAfter = await mockUsdc.balanceOf(platform.address);
      expect(balanceAfter - balanceBefore).to.equal(MINT_FEE);
    });

    it("Should revert withdrawal if no fees accumulated", async function () {
      await expect(
        payments.connect(owner).withdrawFees()
      ).to.be.revertedWithCustomError(payments, "NoFeesToWithdraw");
    });

    it("Should not allow non-owner to withdraw fees", async function () {
      await expect(
        payments.connect(user1).withdrawFees()
      ).to.be.revertedWithCustomError(payments, "OwnableUnauthorizedAccount");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle payment ID collision between gen and mint", async function () {
      // Same payment ID cannot be used for both generation and mint
      const sharedId = ethers.keccak256(ethers.toUtf8Bytes("shared-id"));

      await mockUsdc.connect(user1).approve(await payments.getAddress(), parseUSDC("10"));
      await payments.connect(user1).payForGeneration(sharedId, 1);

      // Should fail because ID is already used
      await expect(
        payments.connect(user1).payForMint(sharedId)
      ).to.be.revertedWithCustomError(payments, "PaymentAlreadyProcessed");
    });

    it("Should handle different users with same payment ID", async function () {
      const paymentId = ethers.keccak256(ethers.toUtf8Bytes("shared-payment"));

      await mockUsdc.connect(user1).approve(await payments.getAddress(), parseUSDC("10"));
      await mockUsdc.connect(user2).approve(await payments.getAddress(), parseUSDC("10"));

      await payments.connect(user1).payForGeneration(paymentId, 1);

      // Same payment ID fails even from different user
      await expect(
        payments.connect(user2).payForGeneration(paymentId, 1)
      ).to.be.revertedWithCustomError(payments, "PaymentAlreadyProcessed");
    });

    it("Should charge correct fees after fee update", async function () {
      const newFee = parseUSDC("0.75");
      await payments.connect(owner).setFees(newFee, parseUSDC("2"), parseUSDC("1.5"));

      await mockUsdc.connect(user1).approve(await payments.getAddress(), parseUSDC("10"));

      const balanceBefore = await mockUsdc.balanceOf(user1.address);
      await payments.connect(user1).payForGeneration(
        ethers.keccak256(ethers.toUtf8Bytes("new-payment")),
        1
      );
      const balanceAfter = await mockUsdc.balanceOf(user1.address);

      expect(balanceBefore - balanceAfter).to.equal(newFee);
    });
  });
});
