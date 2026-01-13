const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTmarketNFT", function () {
  let nftmarket;
  let owner, platform, artist, buyer, other;

  const LicenseType = {
    Display: 0,
    Commercial: 1,
    Transfer: 2
  };

  // Sample data
  const tokenUri = "ipfs://QmSampleMetadataHash";
  const imageHash = ethers.keccak256(ethers.toUtf8Bytes("sample-image-data"));
  const licenseHash = ethers.keccak256(ethers.toUtf8Bytes("sample-license-data"));
  const encryptedBlobUri = "ipfs://QmEncryptedBlobHash";

  beforeEach(async function () {
    [owner, platform, artist, buyer, other] = await ethers.getSigners();

    const NFTmarketNFT = await ethers.getContractFactory("NFTmarketNFT");
    nftmarket = await NFTmarketNFT.deploy(platform.address);
    await nftmarket.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await nftmarket.name()).to.equal("NFTmarket");
      expect(await nftmarket.symbol()).to.equal("NFTM");
    });

    it("Should set the platform wallet", async function () {
      expect(await nftmarket.platformWallet()).to.equal(platform.address);
    });

    it("Should start with zero supply", async function () {
      expect(await nftmarket.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should mint a token with Display license", async function () {
      const tx = await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Display,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );

      await expect(tx)
        .to.emit(nftmarket, "Minted")
        .withArgs(0, artist.address, LicenseType.Display, imageHash);

      expect(await nftmarket.ownerOf(0)).to.equal(artist.address);
      expect(await nftmarket.totalSupply()).to.equal(1);
    });

    it("Should mint a token with Commercial license", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Commercial,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );

      const data = await nftmarket.getTokenData(0);
      expect(data.licenseType).to.equal(LicenseType.Commercial);
    });

    it("Should mint a token with Transfer license", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Transfer,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );

      const data = await nftmarket.getTokenData(0);
      expect(data.licenseType).to.equal(LicenseType.Transfer);
    });

    it("Should store correct token data", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Commercial,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );

      const data = await nftmarket.getTokenData(0);
      expect(data.creator).to.equal(artist.address);
      expect(data.currentOwner).to.equal(artist.address);
      expect(data.imageHash).to.equal(imageHash);
      expect(data.licenseHash).to.equal(licenseHash);
      expect(data.encryptedBlobUri).to.equal(encryptedBlobUri);
      expect(data.uri).to.equal(tokenUri);
    });

    it("Should prevent duplicate image hashes", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Display,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );

      await expect(
        nftmarket.connect(other).mint(
          other.address,
          "ipfs://different",
          LicenseType.Display,
          imageHash, // Same image hash
          licenseHash,
          encryptedBlobUri
        )
      ).to.be.revertedWithCustomError(nftmarket, "ImageAlreadyRegistered");
    });

    it("Should set royalty for creator", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Display,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );

      const salePrice = ethers.parseEther("1");
      const [recipient, amount] = await nftmarket.royaltyInfo(0, salePrice);

      expect(recipient).to.equal(artist.address);
      expect(amount).to.equal(salePrice * 250n / 10000n); // 2.5%
    });
  });

  describe("Marketplace - Listing", function () {
    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Display,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );
    });

    it("Should allow owner to list token", async function () {
      const price = ethers.parseEther("0.5");

      await expect(nftmarket.connect(artist).list(0, price))
        .to.emit(nftmarket, "Listed")
        .withArgs(0, artist.address, price);

      const listing = await nftmarket.getListing(0);
      expect(listing.seller).to.equal(artist.address);
      expect(listing.price).to.equal(price);
      expect(listing.active).to.be.true;
    });

    it("Should not allow non-owner to list", async function () {
      await expect(
        nftmarket.connect(other).list(0, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(nftmarket, "NotTokenOwner");
    });

    it("Should not allow zero price", async function () {
      await expect(
        nftmarket.connect(artist).list(0, 0)
      ).to.be.revertedWithCustomError(nftmarket, "InvalidPrice");
    });

    it("Should not allow double listing", async function () {
      await nftmarket.connect(artist).list(0, ethers.parseEther("1"));

      await expect(
        nftmarket.connect(artist).list(0, ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(nftmarket, "AlreadyListed");
    });

    it("Should allow owner to delist", async function () {
      await nftmarket.connect(artist).list(0, ethers.parseEther("1"));

      await expect(nftmarket.connect(artist).delist(0))
        .to.emit(nftmarket, "Delisted")
        .withArgs(0, artist.address);

      const listing = await nftmarket.getListing(0);
      expect(listing.active).to.be.false;
    });
  });

  describe("Marketplace - Buying", function () {
    const listPrice = ethers.parseEther("1");

    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Display,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );
      await nftmarket.connect(artist).list(0, listPrice);
    });

    it("Should allow buying a listed token", async function () {
      const artistBalanceBefore = await ethers.provider.getBalance(artist.address);
      const platformBalanceBefore = await ethers.provider.getBalance(platform.address);

      await expect(nftmarket.connect(buyer).buy(0, { value: listPrice }))
        .to.emit(nftmarket, "Sold")
        .withArgs(0, artist.address, buyer.address, listPrice);

      // Check ownership transferred
      expect(await nftmarket.ownerOf(0)).to.equal(buyer.address);

      // Check listing cleared
      const listing = await nftmarket.getListing(0);
      expect(listing.active).to.be.false;

      // Check payments (2.5% platform fee, artist gets rest)
      const platformFee = listPrice * 250n / 10000n;
      const artistProceeds = listPrice - platformFee; // No royalty since artist is seller

      const artistBalanceAfter = await ethers.provider.getBalance(artist.address);
      const platformBalanceAfter = await ethers.provider.getBalance(platform.address);

      expect(platformBalanceAfter - platformBalanceBefore).to.equal(platformFee);
      expect(artistBalanceAfter - artistBalanceBefore).to.equal(artistProceeds);
    });

    it("Should pay royalty on secondary sales", async function () {
      // First sale: artist -> buyer
      await nftmarket.connect(buyer).buy(0, { value: listPrice });

      // Buyer relists
      const resalePrice = ethers.parseEther("2");
      await nftmarket.connect(buyer).list(0, resalePrice);

      // Second sale: buyer -> other
      const artistBalanceBefore = await ethers.provider.getBalance(artist.address);

      await nftmarket.connect(other).buy(0, { value: resalePrice });

      // Artist should receive 2.5% royalty
      const royalty = resalePrice * 250n / 10000n;
      const artistBalanceAfter = await ethers.provider.getBalance(artist.address);

      expect(artistBalanceAfter - artistBalanceBefore).to.equal(royalty);
    });

    it("Should not allow buying unlisted token", async function () {
      await nftmarket.connect(artist).delist(0);

      await expect(
        nftmarket.connect(buyer).buy(0, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "NotListed");
    });

    it("Should not allow insufficient payment", async function () {
      await expect(
        nftmarket.connect(buyer).buy(0, { value: listPrice / 2n })
      ).to.be.revertedWithCustomError(nftmarket, "InsufficientPayment");
    });

    it("Should not allow buying own token", async function () {
      await expect(
        nftmarket.connect(artist).buy(0, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "CannotBuyOwnToken");
    });

    it("Should refund excess payment", async function () {
      const excessAmount = ethers.parseEther("0.5");
      const totalPayment = listPrice + excessAmount;

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await nftmarket.connect(buyer).buy(0, { value: totalPayment });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);

      // Buyer should only be charged listPrice + gas (excess refunded)
      const actualSpent = buyerBalanceBefore - buyerBalanceAfter - gasUsed;
      expect(actualSpent).to.be.closeTo(listPrice, ethers.parseEther("0.001"));
    });

    it("Should auto-delist on manual transfer", async function () {
      // Transfer outside marketplace should delist
      await nftmarket.connect(artist).transferFrom(artist.address, buyer.address, 0);

      const listing = await nftmarket.getListing(0);
      expect(listing.active).to.be.false;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        LicenseType.Commercial,
        imageHash,
        licenseHash,
        encryptedBlobUri
      );
    });

    it("Should return correct token URI", async function () {
      expect(await nftmarket.tokenURI(0)).to.equal(tokenUri);
    });

    it("Should check if image is registered", async function () {
      expect(await nftmarket.isImageRegistered(imageHash)).to.be.true;

      const unregisteredHash = ethers.keccak256(ethers.toUtf8Bytes("other"));
      expect(await nftmarket.isImageRegistered(unregisteredHash)).to.be.false;
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to change platform wallet", async function () {
      await nftmarket.connect(owner).setPlatformWallet(other.address);
      expect(await nftmarket.platformWallet()).to.equal(other.address);
    });

    it("Should not allow non-owner to change platform wallet", async function () {
      await expect(
        nftmarket.connect(other).setPlatformWallet(other.address)
      ).to.be.revertedWithCustomError(nftmarket, "OwnableUnauthorizedAccount");
    });
  });
});
