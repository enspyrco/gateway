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

  // EIP-712 domain
  let domain;

  // EIP-712 types
  const ListingOfferTypes = {
    ListingOffer: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "licenseType", type: "uint8" },
      { name: "licenseHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" }
    ]
  };

  const PurchaseAcceptanceTypes = {
    PurchaseAcceptance: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "licenseType", type: "uint8" },
      { name: "licenseHash", type: "bytes32" },
      { name: "seller", type: "address" },
      { name: "nonce", type: "uint256" }
    ]
  };

  // Helper to sign a listing offer
  async function signListingOffer(signer, tokenId, price, licenseType, licenseHash, nonce, expiry) {
    const value = {
      tokenId,
      price,
      licenseType,
      licenseHash,
      nonce,
      expiry
    };
    return await signer.signTypedData(domain, ListingOfferTypes, value);
  }

  // Helper to sign a purchase acceptance
  async function signPurchaseAcceptance(signer, tokenId, price, licenseType, licenseHash, seller, nonce) {
    const value = {
      tokenId,
      price,
      licenseType,
      licenseHash,
      seller,
      nonce
    };
    return await signer.signTypedData(domain, PurchaseAcceptanceTypes, value);
  }

  // Helper to list a token with signature
  async function listToken(signer, tokenId, price, licenseType = LicenseType.Display, expiry = 0) {
    const nonce = await nftmarket.getNonce(signer.address);
    const signature = await signListingOffer(signer, tokenId, price, licenseType, licenseHash, nonce, expiry);
    return nftmarket.connect(signer).list(tokenId, price, licenseType, licenseHash, expiry, signature);
  }

  // Helper to buy a token with signature
  async function buyToken(signer, tokenId, value) {
    const listing = await nftmarket.getListing(tokenId);
    const signature = await signPurchaseAcceptance(
      signer,
      tokenId,
      listing.price,
      listing.licenseType,
      listing.licenseHash,
      listing.seller,
      listing.nonce
    );
    return nftmarket.connect(signer).buy(tokenId, signature, { value });
  }

  beforeEach(async function () {
    [owner, platform, artist, buyer, other] = await ethers.getSigners();

    const NFTmarketNFT = await ethers.getContractFactory("NFTmarketNFT");
    nftmarket = await NFTmarketNFT.deploy(platform.address);
    await nftmarket.waitForDeployment();

    // Set up EIP-712 domain
    const contractAddress = await nftmarket.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    domain = {
      name: "NFTmarket",
      version: "1",
      chainId: chainId,
      verifyingContract: contractAddress
    };
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

    it("Should expose EIP-712 domain separator", async function () {
      const domainSeparator = await nftmarket.getDomainSeparator();
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Minting", function () {
    it("Should mint a token", async function () {
      const tx = await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );

      await expect(tx)
        .to.emit(nftmarket, "Minted")
        .withArgs(0, artist.address, imageHash);

      expect(await nftmarket.ownerOf(0)).to.equal(artist.address);
      expect(await nftmarket.totalSupply()).to.equal(1);
    });

    it("Should store correct token data", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );

      const data = await nftmarket.getTokenData(0);
      expect(data.creator).to.equal(artist.address);
      expect(data.currentOwner).to.equal(artist.address);
      expect(data.imageHash).to.equal(imageHash);
      expect(data.encryptedBlobUri).to.equal(encryptedBlobUri);
      expect(data.uri).to.equal(tokenUri);
    });

    it("Should prevent duplicate image hashes", async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );

      await expect(
        nftmarket.connect(other).mint(
          other.address,
          "ipfs://different",
          imageHash, // Same image hash
          encryptedBlobUri
        )
      ).to.be.revertedWithCustomError(nftmarket, "ImageAlreadyRegistered");
    });
  });

  describe("Marketplace - Listing with Signature", function () {
    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );
    });

    it("Should allow owner to list token with valid signature", async function () {
      const price = ethers.parseEther("0.5");

      await expect(listToken(artist, 0, price))
        .to.emit(nftmarket, "Listed")
        .withArgs(0, artist.address, price, LicenseType.Display, licenseHash, 0, 0);

      const listing = await nftmarket.getListing(0);
      expect(listing.seller).to.equal(artist.address);
      expect(listing.price).to.equal(price);
      expect(listing.licenseType).to.equal(LicenseType.Display);
      expect(listing.licenseHash).to.equal(licenseHash);
      expect(listing.active).to.be.true;
    });

    it("Should store seller signature on listing", async function () {
      const price = ethers.parseEther("0.5");
      await listToken(artist, 0, price);

      const storedSig = await nftmarket.getListingSignature(0);
      expect(storedSig.length).to.be.greaterThan(0);
    });

    it("Should reject listing with invalid signature", async function () {
      const price = ethers.parseEther("0.5");
      const nonce = await nftmarket.getNonce(artist.address);

      // Sign with wrong signer
      const wrongSignature = await signListingOffer(other, 0, price, LicenseType.Display, licenseHash, nonce, 0);

      await expect(
        nftmarket.connect(artist).list(0, price, LicenseType.Display, licenseHash, 0, wrongSignature)
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should not allow non-owner to list", async function () {
      const price = ethers.parseEther("1");
      const nonce = await nftmarket.getNonce(other.address);
      const signature = await signListingOffer(other, 0, price, LicenseType.Display, licenseHash, nonce, 0);

      await expect(
        nftmarket.connect(other).list(0, price, LicenseType.Display, licenseHash, 0, signature)
      ).to.be.revertedWithCustomError(nftmarket, "NotTokenOwner");
    });

    it("Should not allow zero price", async function () {
      const nonce = await nftmarket.getNonce(artist.address);
      const signature = await signListingOffer(artist, 0, 0, LicenseType.Display, licenseHash, nonce, 0);

      await expect(
        nftmarket.connect(artist).list(0, 0, LicenseType.Display, licenseHash, 0, signature)
      ).to.be.revertedWithCustomError(nftmarket, "InvalidPrice");
    });

    it("Should not allow double listing", async function () {
      await listToken(artist, 0, ethers.parseEther("1"));

      await expect(
        listToken(artist, 0, ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(nftmarket, "AlreadyListed");
    });

    it("Should support listing with expiry", async function () {
      const price = ethers.parseEther("0.5");
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await expect(listToken(artist, 0, price, LicenseType.Display, futureExpiry))
        .to.emit(nftmarket, "Listed");

      const listing = await nftmarket.getListing(0);
      expect(listing.expiry).to.equal(futureExpiry);
    });

    it("Should reject listing with past expiry", async function () {
      const price = ethers.parseEther("0.5");
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const nonce = await nftmarket.getNonce(artist.address);
      const signature = await signListingOffer(artist, 0, price, LicenseType.Display, licenseHash, nonce, pastExpiry);

      await expect(
        nftmarket.connect(artist).list(0, price, LicenseType.Display, licenseHash, pastExpiry, signature)
      ).to.be.revertedWithCustomError(nftmarket, "ListingExpired");
    });

    it("Should allow owner to delist", async function () {
      await listToken(artist, 0, ethers.parseEther("1"));

      await expect(nftmarket.connect(artist).delist(0))
        .to.emit(nftmarket, "Delisted")
        .withArgs(0, artist.address);

      const listing = await nftmarket.getListing(0);
      expect(listing.active).to.be.false;
    });

    it("Should increment nonce after listing", async function () {
      const nonceBefore = await nftmarket.getNonce(artist.address);
      await listToken(artist, 0, ethers.parseEther("1"));
      const nonceAfter = await nftmarket.getNonce(artist.address);

      expect(nonceAfter).to.equal(nonceBefore + 1n);
    });
  });

  describe("Marketplace - Buying with Bilateral Signatures", function () {
    const listPrice = ethers.parseEther("1");

    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );
      await listToken(artist, 0, listPrice);
    });

    it("Should allow buying with valid buyer signature", async function () {
      const artistBalanceBefore = await ethers.provider.getBalance(artist.address);
      const platformBalanceBefore = await ethers.provider.getBalance(platform.address);

      const tx = await buyToken(buyer, 0, listPrice);

      await expect(tx)
        .to.emit(nftmarket, "Sold")
        .withArgs(0, artist.address, buyer.address, listPrice, LicenseType.Display, licenseHash);

      // Check BilateralAgreement event was emitted
      await expect(tx).to.emit(nftmarket, "BilateralAgreement");

      // Check ownership transferred
      expect(await nftmarket.ownerOf(0)).to.equal(buyer.address);

      // Check listing cleared
      const listing = await nftmarket.getListing(0);
      expect(listing.active).to.be.false;

      // Check payments (2.5% platform fee, seller gets rest)
      const platformFee = listPrice * 250n / 10000n;
      const artistProceeds = listPrice - platformFee;

      const artistBalanceAfter = await ethers.provider.getBalance(artist.address);
      const platformBalanceAfter = await ethers.provider.getBalance(platform.address);

      expect(platformBalanceAfter - platformBalanceBefore).to.equal(platformFee);
      expect(artistBalanceAfter - artistBalanceBefore).to.equal(artistProceeds);
    });

    it("Should emit BilateralAgreement with both signatures", async function () {
      const listing = await nftmarket.getListing(0);
      const buyerSignature = await signPurchaseAcceptance(
        buyer,
        0,
        listing.price,
        listing.licenseType,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      const tx = await nftmarket.connect(buyer).buy(0, buyerSignature, { value: listPrice });
      const receipt = await tx.wait();

      // Find the BilateralAgreement event
      const event = receipt.logs.find(log => {
        try {
          return nftmarket.interface.parseLog(log)?.name === "BilateralAgreement";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      const parsed = nftmarket.interface.parseLog(event);
      expect(parsed.args.sellerSignature.length).to.be.greaterThan(0);
      expect(parsed.args.buyerSignature).to.equal(buyerSignature);
    });

    it("Should reject purchase with invalid buyer signature", async function () {
      const listing = await nftmarket.getListing(0);

      // Sign with wrong signer
      const wrongSignature = await signPurchaseAcceptance(
        other, // Wrong signer
        0,
        listing.price,
        listing.licenseType,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, wrongSignature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should reject purchase with mismatched terms in signature", async function () {
      const listing = await nftmarket.getListing(0);

      // Sign with wrong price
      const wrongSignature = await signPurchaseAcceptance(
        buyer,
        0,
        ethers.parseEther("0.5"), // Wrong price
        listing.licenseType,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, wrongSignature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should not allow buying unlisted token", async function () {
      await nftmarket.connect(artist).delist(0);

      const signature = await signPurchaseAcceptance(buyer, 0, listPrice, LicenseType.Display, licenseHash, artist.address, 0);

      await expect(
        nftmarket.connect(buyer).buy(0, signature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "NotListed");
    });

    it("Should not allow insufficient payment", async function () {
      const listing = await nftmarket.getListing(0);
      const signature = await signPurchaseAcceptance(
        buyer,
        0,
        listing.price,
        listing.licenseType,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, signature, { value: listPrice / 2n })
      ).to.be.revertedWithCustomError(nftmarket, "InsufficientPayment");
    });

    it("Should not allow buying own token", async function () {
      const listing = await nftmarket.getListing(0);
      const signature = await signPurchaseAcceptance(
        artist,
        0,
        listing.price,
        listing.licenseType,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(artist).buy(0, signature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "CannotBuyOwnToken");
    });

    it("Should refund excess payment", async function () {
      const excessAmount = ethers.parseEther("0.5");
      const totalPayment = listPrice + excessAmount;

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const listing = await nftmarket.getListing(0);
      const signature = await signPurchaseAcceptance(
        buyer,
        0,
        listing.price,
        listing.licenseType,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      const tx = await nftmarket.connect(buyer).buy(0, signature, { value: totalPayment });
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
        imageHash,
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

    it("Should return correct nonce", async function () {
      expect(await nftmarket.getNonce(artist.address)).to.equal(0);

      await listToken(artist, 0, ethers.parseEther("1"));

      expect(await nftmarket.getNonce(artist.address)).to.equal(1);
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

  describe("Signature Replay Protection", function () {
    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );
    });

    it("Should not allow reusing listing signature after delist", async function () {
      const price = ethers.parseEther("1");
      const nonce = await nftmarket.getNonce(artist.address);
      const signature = await signListingOffer(artist, 0, price, LicenseType.Display, licenseHash, nonce, 0);

      // First listing succeeds
      await nftmarket.connect(artist).list(0, price, LicenseType.Display, licenseHash, 0, signature);
      await nftmarket.connect(artist).delist(0);

      // Trying to reuse same signature should fail (nonce has incremented)
      await expect(
        nftmarket.connect(artist).list(0, price, LicenseType.Display, licenseHash, 0, signature)
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should not allow buyer signature for different listing nonce", async function () {
      const price = ethers.parseEther("1");

      // List once
      await listToken(artist, 0, price);
      const firstListing = await nftmarket.getListing(0);

      // Delist
      await nftmarket.connect(artist).delist(0);

      // List again (new nonce)
      await listToken(artist, 0, price);

      // Try to use old nonce in buyer signature
      const oldNonceSignature = await signPurchaseAcceptance(
        buyer,
        0,
        price,
        firstListing.licenseType,
        firstListing.licenseHash,
        firstListing.seller,
        firstListing.nonce // Old nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, oldNonceSignature, { value: price })
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });
  });

  describe("License Rights Tracking", function () {
    const price = ethers.parseEther("1");

    beforeEach(async function () {
      await nftmarket.connect(artist).mint(
        artist.address,
        tokenUri,
        imageHash,
        encryptedBlobUri
      );
    });

    describe("Initial state", function () {
      it("Should give creator Transfer rights at mint", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.ownerLicense).to.equal(LicenseType.Transfer);
        expect(data.copyrightOwner).to.equal(artist.address);
        expect(data.creator).to.equal(artist.address);
      });

      it("Should return correct max sellable license for creator", async function () {
        expect(await nftmarket.getMaxSellableLicense(0)).to.equal(LicenseType.Transfer);
      });

      it("Creator should have all rights", async function () {
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, artist.address)).to.be.true;
      });
    });

    describe("Cannot escalate rights", function () {
      it("Should allow listing at same or lower license level", async function () {
        // Creator has Transfer, can list at any level
        await expect(listToken(artist, 0, price, LicenseType.Display)).to.not.be.reverted;
        await nftmarket.connect(artist).delist(0);

        await expect(listToken(artist, 0, price, LicenseType.Commercial)).to.not.be.reverted;
        await nftmarket.connect(artist).delist(0);

        await expect(listToken(artist, 0, price, LicenseType.Transfer)).to.not.be.reverted;
      });

      it("Should prevent listing above owned license level", async function () {
        // Sell with Display license to buyer
        await listToken(artist, 0, price, LicenseType.Display);
        await buyToken(buyer, 0, price);

        // Buyer now has Display rights, should not be able to list as Commercial
        const nonce = await nftmarket.getNonce(buyer.address);
        const signature = await signListingOffer(buyer, 0, price, LicenseType.Commercial, licenseHash, nonce, 0);

        await expect(
          nftmarket.connect(buyer).list(0, price, LicenseType.Commercial, licenseHash, 0, signature)
        ).to.be.revertedWithCustomError(nftmarket, "CannotEscalateRights");
      });

      it("Should allow re-listing at same license level", async function () {
        // Sell with Commercial license to buyer
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price);

        // Buyer has Commercial rights, should be able to list at Commercial or Display
        await expect(listToken(buyer, 0, price, LicenseType.Commercial)).to.not.be.reverted;
      });
    });

    describe("Display license sale", function () {
      beforeEach(async function () {
        await listToken(artist, 0, price, LicenseType.Display);
        await buyToken(buyer, 0, price);
      });

      it("Should give buyer Display license", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.ownerLicense).to.equal(LicenseType.Display);
      });

      it("Should not transfer copyright", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.copyrightOwner).to.equal(artist.address);
      });

      it("Buyer should have display rights but not commercial", async function () {
        expect(await nftmarket.checkDisplayRights(0, buyer.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(0, buyer.address)).to.be.false;
        expect(await nftmarket.checkCopyrightOwnership(0, buyer.address)).to.be.false;
      });

      it("Creator retains all rights", async function () {
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, artist.address)).to.be.true;
      });
    });

    describe("Commercial license sale", function () {
      beforeEach(async function () {
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price);
      });

      it("Should give buyer Commercial license", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.ownerLicense).to.equal(LicenseType.Commercial);
      });

      it("Should not transfer copyright", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.copyrightOwner).to.equal(artist.address);
      });

      it("Buyer should have display and commercial rights", async function () {
        expect(await nftmarket.checkDisplayRights(0, buyer.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(0, buyer.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, buyer.address)).to.be.false;
      });
    });

    describe("Transfer license sale (copyright transfer)", function () {
      beforeEach(async function () {
        await listToken(artist, 0, price, LicenseType.Transfer);
        await buyToken(buyer, 0, price);
      });

      it("Should give buyer Transfer license", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.ownerLicense).to.equal(LicenseType.Transfer);
      });

      it("Should transfer copyright to buyer", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.copyrightOwner).to.equal(buyer.address);
      });

      it("Should emit CopyrightTransferred event", async function () {
        // Mint new token for this test
        const newImageHash = ethers.keccak256(ethers.toUtf8Bytes("another-image"));
        await nftmarket.connect(artist).mint(artist.address, tokenUri, newImageHash, encryptedBlobUri);

        await listToken(artist, 1, price, LicenseType.Transfer);

        const listing = await nftmarket.getListing(1);
        const signature = await signPurchaseAcceptance(
          buyer, 1, listing.price, listing.licenseType, listing.licenseHash, listing.seller, listing.nonce
        );

        await expect(nftmarket.connect(buyer).buy(1, signature, { value: price }))
          .to.emit(nftmarket, "CopyrightTransferred")
          .withArgs(1, artist.address, buyer.address);
      });

      it("Should emit DisplayRightsRetained event for seller", async function () {
        const newImageHash = ethers.keccak256(ethers.toUtf8Bytes("yet-another-image"));
        await nftmarket.connect(artist).mint(artist.address, tokenUri, newImageHash, encryptedBlobUri);

        await listToken(artist, 1, price, LicenseType.Transfer);

        const listing = await nftmarket.getListing(1);
        const signature = await signPurchaseAcceptance(
          buyer, 1, listing.price, listing.licenseType, listing.licenseHash, listing.seller, listing.nonce
        );

        await expect(nftmarket.connect(buyer).buy(1, signature, { value: price }))
          .to.emit(nftmarket, "DisplayRightsRetained")
          .withArgs(1, artist.address);
      });

      it("Seller (original creator) retains display rights after transfer", async function () {
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
        expect(await nftmarket.hasDisplayLicense(0, artist.address)).to.be.true;
      });

      it("Creator always has display rights (moral rights)", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.creator).to.equal(artist.address);
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
      });

      it("Buyer should have all rights after Transfer", async function () {
        expect(await nftmarket.checkDisplayRights(0, buyer.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(0, buyer.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, buyer.address)).to.be.true;
      });

      it("Original seller no longer has commercial/copyright after Transfer", async function () {
        // Artist sold Transfer, so they no longer have commercial rights
        expect(await nftmarket.checkCommercialRights(0, artist.address)).to.be.false;
        expect(await nftmarket.checkCopyrightOwnership(0, artist.address)).to.be.false;
      });
    });

    describe("Chain of sales with rights tracking", function () {
      it("Should track display rights through multiple Transfer sales", async function () {
        // Artist sells to buyer with Transfer
        await listToken(artist, 0, price, LicenseType.Transfer);
        await buyToken(buyer, 0, price);

        // Artist retains display rights
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;

        // Buyer sells to other with Transfer
        await listToken(buyer, 0, price, LicenseType.Transfer);
        await buyToken(other, 0, price);

        // Both artist and buyer retain display rights
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkDisplayRights(0, buyer.address)).to.be.true;

        // Other now owns copyright
        expect(await nftmarket.checkCopyrightOwnership(0, other.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, buyer.address)).to.be.false;
      });

      it("Should prevent escalation in chain of sales", async function () {
        // Artist sells to buyer with Commercial
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price);

        // Buyer can only list at Commercial or below
        expect(await nftmarket.getMaxSellableLicense(0)).to.equal(LicenseType.Commercial);

        // Buyer sells to other with Display
        await listToken(buyer, 0, price, LicenseType.Display);
        await buyToken(other, 0, price);

        // Other can only list at Display
        expect(await nftmarket.getMaxSellableLicense(0)).to.equal(LicenseType.Display);

        // Other cannot escalate to Commercial
        const nonce = await nftmarket.getNonce(other.address);
        const signature = await signListingOffer(other, 0, price, LicenseType.Commercial, licenseHash, nonce, 0);

        await expect(
          nftmarket.connect(other).list(0, price, LicenseType.Commercial, licenseHash, 0, signature)
        ).to.be.revertedWithCustomError(nftmarket, "CannotEscalateRights");
      });
    });
  });
});
