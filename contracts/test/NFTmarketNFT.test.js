const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NFTmarketNFT", function () {
  let nftmarket;
  let owner, admin, minter, artist, buyer, other, partnerAdmin, partnerMinter;

  const LicenseType = {
    Display: 0,
    Commercial: 1,
    Transfer: 2
  };

  // Sample data
  const tokenUri = "ar://SampleMetadataHash";
  const imageHash = ethers.keccak256(ethers.toUtf8Bytes("sample-image-data"));
  const licenseHash = ethers.keccak256(ethers.toUtf8Bytes("sample-license-data"));
  const ipfsUri = "ipfs://QmWatermarkedImageHash";

  // Default fee: 2.5%
  const DEFAULT_FEE_BPS = 250;

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
  async function buyToken(signer, tokenId, value, licenseType = LicenseType.Display) {
    const listing = await nftmarket.getListing(tokenId, licenseType);
    const signature = await signPurchaseAcceptance(
      signer,
      tokenId,
      listing.price,
      licenseType,  // Use parameter, not listing.licenseType (contract doesn't return it)
      listing.licenseHash,
      listing.seller,
      listing.nonce
    );
    return nftmarket.connect(signer).buy(tokenId, licenseType, signature, { value });
  }

  // Helper to reserve and mint a token (new reservation pattern with minter)
  async function reserveAndMint(minterSigner, to, uri, imgHash, ipfs) {
    // First reserve the token ID
    const reserveTx = await nftmarket.connect(minterSigner).reserveTokenId();
    const receipt = await reserveTx.wait();
    const event = receipt.logs.find(log => {
      try {
        return nftmarket.interface.parseLog(log)?.name === "TokenReserved";
      } catch { return false; }
    });
    const tokenId = nftmarket.interface.parseLog(event).args.tokenId;

    // Then mint with the reserved ID
    await nftmarket.connect(minterSigner).mint(tokenId, to, uri, imgHash, ipfs);
    return tokenId;
  }

  beforeEach(async function () {
    [owner, admin, minter, artist, buyer, other, partnerAdmin, partnerMinter] = await ethers.getSigners();

    // Deploy via UUPS proxy
    const NFTmarketNFT = await ethers.getContractFactory("NFTmarketNFT");
    nftmarket = await upgrades.deployProxy(
      NFTmarketNFT,
      [owner.address, admin.address, DEFAULT_FEE_BPS],
      { kind: 'uups', initializer: 'initialize' }
    );
    await nftmarket.waitForDeployment();

    // Add minter to Authority 0
    await nftmarket.connect(admin).addMinter(0, minter.address);

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

  describe("Deployment & Initialization", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await nftmarket.name()).to.equal("NFTmarket");
      expect(await nftmarket.symbol()).to.equal("NFTM");
    });

    it("Should set the correct owner", async function () {
      expect(await nftmarket.owner()).to.equal(owner.address);
    });

    it("Should create Authority 0 with correct admin and fee", async function () {
      const [authAdmin, authFeeBps, authIsActive, authRegisteredAt] = await nftmarket.getAuthority(0);
      expect(authAdmin).to.equal(admin.address);
      expect(authFeeBps).to.equal(DEFAULT_FEE_BPS);
      expect(authIsActive).to.be.true;
      expect(authRegisteredAt).to.be.gt(0);
    });

    it("Should start with zero supply", async function () {
      expect(await nftmarket.totalSupply()).to.equal(0);
    });

    it("Should start with 1 authority (Authority 0)", async function () {
      expect(await nftmarket.totalAuthorities()).to.equal(1);
    });

    it("Should expose EIP-712 domain separator", async function () {
      const domainSeparator = await nftmarket.getDomainSeparator();
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });

    it("Should not allow re-initialization", async function () {
      await expect(
        nftmarket.initialize(owner.address, admin.address, 250)
      ).to.be.revertedWithCustomError(nftmarket, "InvalidInitialization");
    });
  });

  describe("Authority Management", function () {
    describe("Register Authority", function () {
      it("Should allow owner to register new authority", async function () {
        const tx = await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 300);
        await expect(tx)
          .to.emit(nftmarket, "AuthorityRegistered")
          .withArgs(1, partnerAdmin.address, 300);

        const [authAdmin, authFeeBps, authIsActive] = await nftmarket.getAuthority(1);
        expect(authAdmin).to.equal(partnerAdmin.address);
        expect(authFeeBps).to.equal(300);
        expect(authIsActive).to.be.true;
        expect(await nftmarket.totalAuthorities()).to.equal(2);
      });

      it("Should not allow non-owner to register authority", async function () {
        await expect(
          nftmarket.connect(admin).registerAuthority(partnerAdmin.address, 300)
        ).to.be.revertedWithCustomError(nftmarket, "OwnableUnauthorizedAccount");
      });
    });

    describe("Deactivate Authority", function () {
      it("Should allow owner to deactivate authority", async function () {
        await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 300);

        const tx = await nftmarket.connect(owner).deactivateAuthority(1);
        await expect(tx).to.emit(nftmarket, "AuthorityDeactivated").withArgs(1);

        const [, , authIsActive] = await nftmarket.getAuthority(1);
        expect(authIsActive).to.be.false;
      });

      it("Should not allow non-owner to deactivate authority", async function () {
        await expect(
          nftmarket.connect(admin).deactivateAuthority(0)
        ).to.be.revertedWithCustomError(nftmarket, "OwnableUnauthorizedAccount");
      });

      it("Should revert if authority does not exist", async function () {
        await expect(
          nftmarket.connect(owner).deactivateAuthority(999)
        ).to.be.revertedWithCustomError(nftmarket, "AuthorityNotFound");
      });
    });

    describe("Update Authority Fee", function () {
      it("Should allow authority admin to update their own fee", async function () {
        const tx = await nftmarket.connect(admin).updateAuthorityFee(0, 500);
        await expect(tx)
          .to.emit(nftmarket, "AuthorityFeeUpdated")
          .withArgs(0, DEFAULT_FEE_BPS, 500);

        const [, authFeeBps] = await nftmarket.getAuthority(0);
        expect(authFeeBps).to.equal(500);
      });

      it("Should not allow non-admin to update fee", async function () {
        await expect(
          nftmarket.connect(owner).updateAuthorityFee(0, 500)
        ).to.be.revertedWithCustomError(nftmarket, "NotAuthorityAdmin");
      });

      it("Should not allow admin of one authority to update another's fee", async function () {
        await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 300);

        await expect(
          nftmarket.connect(admin).updateAuthorityFee(1, 500)
        ).to.be.revertedWithCustomError(nftmarket, "NotAuthorityAdmin");
      });
    });

    describe("Minter Management", function () {
      it("Should allow authority admin to add minter", async function () {
        const tx = await nftmarket.connect(admin).addMinter(0, other.address);
        await expect(tx)
          .to.emit(nftmarket, "MinterAdded")
          .withArgs(0, other.address);

        const [authorityId, isMinter] = await nftmarket.getMinterAuthority(other.address);
        expect(authorityId).to.equal(0);
        expect(isMinter).to.be.true;
      });

      it("Should allow authority admin to remove minter", async function () {
        const tx = await nftmarket.connect(admin).removeMinter(0, minter.address);
        await expect(tx)
          .to.emit(nftmarket, "MinterRemoved")
          .withArgs(0, minter.address);

        const [, isMinter] = await nftmarket.getMinterAuthority(minter.address);
        expect(isMinter).to.be.false;
      });

      it("Should not allow non-admin to add minter", async function () {
        await expect(
          nftmarket.connect(owner).addMinter(0, other.address)
        ).to.be.revertedWithCustomError(nftmarket, "NotAuthorityAdmin");
      });

      it("Should not allow adding minter to inactive authority", async function () {
        await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 300);
        await nftmarket.connect(owner).deactivateAuthority(1);

        await expect(
          nftmarket.connect(partnerAdmin).addMinter(1, partnerMinter.address)
        ).to.be.revertedWithCustomError(nftmarket, "AuthorityNotActive");
      });

      it("Should not allow same minter in multiple authorities", async function () {
        await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 300);

        await expect(
          nftmarket.connect(partnerAdmin).addMinter(1, minter.address)
        ).to.be.revertedWithCustomError(nftmarket, "MinterAlreadyRegistered");
      });

      it("Should not allow removing non-existent minter", async function () {
        await expect(
          nftmarket.connect(admin).removeMinter(0, other.address)
        ).to.be.revertedWithCustomError(nftmarket, "MinterNotFound");
      });
    });
  });

  describe("Minting", function () {
    it("Should reserve and mint a token", async function () {
      // First reserve
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      await expect(reserveTx).to.emit(nftmarket, "TokenReserved");

      const receipt = await reserveTx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedExpiry = block.timestamp + 3600; // 1 hour

      // Check reservation
      const [reserver, expiry, isValid] = await nftmarket.getReservation(0);
      expect(reserver).to.equal(minter.address);
      expect(expiry).to.equal(expectedExpiry);
      expect(isValid).to.be.true;

      // Then mint
      const mintTx = await nftmarket.connect(minter).mint(
        0, // reservedTokenId
        artist.address,
        tokenUri,
        imageHash,
        ipfsUri
      );

      await expect(mintTx)
        .to.emit(nftmarket, "Minted")
        .withArgs(0, artist.address, imageHash, 0, minter.address);

      expect(await nftmarket.ownerOf(0)).to.equal(artist.address);
      expect(await nftmarket.totalSupply()).to.equal(1);
    });

    it("Should store correct token data including minter and authority", async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);

      const data = await nftmarket.getTokenData(0);
      expect(data.creator).to.equal(artist.address);
      expect(data.currentOwner).to.equal(artist.address);
      expect(data.imageHash).to.equal(imageHash);
      expect(data.ipfsUri).to.equal(ipfsUri);
      expect(data.uri).to.equal(tokenUri);
      expect(data.authorityId).to.equal(0);
      expect(data.minter).to.equal(minter.address);
      expect(data.isOriginal).to.be.true;
    });

    it("Should prevent duplicate image hashes", async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);

      // Reserve a new token ID for the duplicate attempt
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const receipt = await reserveTx.wait();
      const event = receipt.logs.find(log => {
        try { return nftmarket.interface.parseLog(log)?.name === "TokenReserved"; }
        catch { return false; }
      });
      const tokenId = nftmarket.interface.parseLog(event).args.tokenId;

      await expect(
        nftmarket.connect(minter).mint(
          tokenId,
          other.address,
          "ar://different",
          imageHash, // Same image hash
          "ipfs://different"
        )
      ).to.be.revertedWithCustomError(nftmarket, "ImageAlreadyRegistered");
    });

    it("Should reject mint without reservation", async function () {
      await expect(
        nftmarket.connect(minter).mint(
          999, // Non-existent reservation
          artist.address,
          tokenUri,
          imageHash,
          ipfsUri
        )
      ).to.be.revertedWithCustomError(nftmarket, "NoValidReservation");
    });

    it("Should reject mint with someone else's reservation", async function () {
      // Minter reserves
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const receipt = await reserveTx.wait();
      const event = receipt.logs.find(log => {
        try { return nftmarket.interface.parseLog(log)?.name === "TokenReserved"; }
        catch { return false; }
      });
      const tokenId = nftmarket.interface.parseLog(event).args.tokenId;

      // Add other as a minter so they can try
      await nftmarket.connect(admin).addMinter(0, other.address);

      // Other tries to use minter's reservation
      await expect(
        nftmarket.connect(other).mint(
          tokenId,
          other.address,
          tokenUri,
          imageHash,
          ipfsUri
        )
      ).to.be.revertedWithCustomError(nftmarket, "ReservationNotYours");
    });

    it("Should reject reserve from non-minter", async function () {
      await expect(
        nftmarket.connect(artist).reserveTokenId()
      ).to.be.revertedWithCustomError(nftmarket, "NotAuthorizedMinter");
    });

    it("Should reject reserve from deactivated authority minter", async function () {
      await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 300);
      await nftmarket.connect(partnerAdmin).addMinter(1, partnerMinter.address);
      await nftmarket.connect(owner).deactivateAuthority(1);

      await expect(
        nftmarket.connect(partnerMinter).reserveTokenId()
      ).to.be.revertedWithCustomError(nftmarket, "AuthorityNotActive");
    });
  });

  describe("Fee Distribution to Minter", function () {
    const listPrice = ethers.parseEther("1");

    beforeEach(async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
      await listToken(artist, 0, listPrice, LicenseType.Transfer);
    });

    it("Should accrue fee to minter wallet, not authority admin", async function () {
      const pendingFeesBefore = await nftmarket.pendingFees(minter.address);
      const artistBalanceBefore = await ethers.provider.getBalance(artist.address);
      const adminPendingBefore = await nftmarket.pendingFees(admin.address);

      await buyToken(buyer, 0, listPrice, LicenseType.Transfer);

      const pendingFeesAfter = await nftmarket.pendingFees(minter.address);
      const artistBalanceAfter = await ethers.provider.getBalance(artist.address);
      const adminPendingAfter = await nftmarket.pendingFees(admin.address);

      // 2.5% fee = 0.025 ETH
      const expectedFee = listPrice * 250n / 10000n;
      const expectedSellerProceeds = listPrice - expectedFee;

      // Minter accrues the fee (pull pattern)
      expect(pendingFeesAfter - pendingFeesBefore).to.equal(expectedFee);

      // Seller receives the rest immediately
      expect(artistBalanceAfter - artistBalanceBefore).to.equal(expectedSellerProceeds);

      // Admin receives nothing (they're just the admin, not the fee recipient)
      expect(adminPendingAfter).to.equal(adminPendingBefore);
    });

    it("Should use correct authority fee percentage", async function () {
      // Register new authority with 5% fee
      await nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 500);
      await nftmarket.connect(partnerAdmin).addMinter(1, partnerMinter.address);

      // Mint with partner minter
      const imageHash2 = ethers.keccak256(ethers.toUtf8Bytes("partner-image"));
      await reserveAndMint(partnerMinter, artist.address, tokenUri, imageHash2, ipfsUri);
      await listToken(artist, 1, listPrice, LicenseType.Transfer);

      const pendingFeesBefore = await nftmarket.pendingFees(partnerMinter.address);

      await buyToken(buyer, 1, listPrice, LicenseType.Transfer);

      const pendingFeesAfter = await nftmarket.pendingFees(partnerMinter.address);

      // 5% fee = 0.05 ETH (accrued via pull pattern)
      const expectedFee = listPrice * 500n / 10000n;
      expect(pendingFeesAfter - pendingFeesBefore).to.equal(expectedFee);
    });

    it("Should route fee to original minter for license tokens too", async function () {
      // Sell Display license - this creates a new license token
      await nftmarket.connect(artist).delist(0, LicenseType.Transfer);
      await listToken(artist, 0, listPrice, LicenseType.Display);

      const pendingFeesBefore = await nftmarket.pendingFees(minter.address);

      // Buy creates license token 1
      await buyToken(buyer, 0, listPrice);

      const pendingFeesAfter = await nftmarket.pendingFees(minter.address);

      // Fee is accrued to original minter (pull pattern)
      const expectedFee = listPrice * 250n / 10000n;
      expect(pendingFeesAfter - pendingFeesBefore).to.equal(expectedFee);

      // Now sell the license token
      await listToken(buyer, 1, listPrice, LicenseType.Transfer);

      const pendingFeesBefore2 = await nftmarket.pendingFees(minter.address);

      await buyToken(other, 1, listPrice, LicenseType.Transfer);

      const pendingFeesAfter2 = await nftmarket.pendingFees(minter.address);

      // Fee still accrues to the ORIGINAL minter (inherited from parent)
      expect(pendingFeesAfter2 - pendingFeesBefore2).to.equal(expectedFee);
    });
  });

  describe("Marketplace - Listing with Signature", function () {
    beforeEach(async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
    });

    it("Should allow owner to list token with valid signature", async function () {
      const price = ethers.parseEther("0.5");

      await expect(listToken(artist, 0, price))
        .to.emit(nftmarket, "Listed")
        .withArgs(0, artist.address, price, LicenseType.Display, licenseHash, 0, 0);

      const listing = await nftmarket.getListing(0, 0);
      expect(listing.seller).to.equal(artist.address);
      expect(listing.price).to.equal(price);
      // licenseType is the key parameter, not a return value
      expect(listing.licenseHash).to.equal(licenseHash);
      expect(listing.active).to.be.true;
    });

    it("Should store seller signature on listing", async function () {
      const price = ethers.parseEther("0.5");
      await listToken(artist, 0, price);

      const storedSig = await nftmarket.getListingSignature(0, 0);
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

      const listing = await nftmarket.getListing(0, 0);
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

      await expect(nftmarket.connect(artist).delist(0, 0))
        .to.emit(nftmarket, "Delisted")
        .withArgs(0, artist.address);

      const listing = await nftmarket.getListing(0, 0);
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
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
      // Use Transfer license for basic buy tests (transfers the actual token)
      await listToken(artist, 0, listPrice, LicenseType.Transfer);
    });

    it("Should allow buying with valid buyer signature", async function () {
      const artistBalanceBefore = await ethers.provider.getBalance(artist.address);
      const pendingFeesBefore = await nftmarket.pendingFees(minter.address);

      const tx = await buyToken(buyer, 0, listPrice, LicenseType.Transfer);

      await expect(tx)
        .to.emit(nftmarket, "Sold")
        .withArgs(0, artist.address, buyer.address, listPrice, LicenseType.Transfer, licenseHash);

      // Check BilateralAgreement event was emitted
      await expect(tx).to.emit(nftmarket, "BilateralAgreement");

      // Check ownership transferred
      expect(await nftmarket.ownerOf(0)).to.equal(buyer.address);

      // Check listing cleared
      const listing = await nftmarket.getListing(0, LicenseType.Transfer);
      expect(listing.active).to.be.false;

      // Check payments (2.5% fee accrued to minter, seller gets rest)
      const fee = listPrice * 250n / 10000n;
      const artistProceeds = listPrice - fee;

      const artistBalanceAfter = await ethers.provider.getBalance(artist.address);
      const pendingFeesAfter = await nftmarket.pendingFees(minter.address);

      expect(pendingFeesAfter - pendingFeesBefore).to.equal(fee);
      expect(artistBalanceAfter - artistBalanceBefore).to.equal(artistProceeds);
    });

    it("Should emit BilateralAgreement with both signatures", async function () {
      const listing = await nftmarket.getListing(0, LicenseType.Transfer);
      const buyerSignature = await signPurchaseAcceptance(
        buyer,
        0,
        listing.price,
        LicenseType.Transfer,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      const tx = await nftmarket.connect(buyer).buy(0, LicenseType.Transfer, buyerSignature, { value: listPrice });
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
      const listing = await nftmarket.getListing(0, LicenseType.Transfer);

      // Sign with wrong signer
      const wrongSignature = await signPurchaseAcceptance(
        other, // Wrong signer
        0,
        listing.price,
        LicenseType.Transfer,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, LicenseType.Transfer, wrongSignature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should reject purchase with mismatched terms in signature", async function () {
      const listing = await nftmarket.getListing(0, LicenseType.Transfer);

      // Sign with wrong price
      const wrongSignature = await signPurchaseAcceptance(
        buyer,
        0,
        ethers.parseEther("0.5"), // Wrong price
        LicenseType.Transfer,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, LicenseType.Transfer, wrongSignature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should not allow buying unlisted token", async function () {
      await nftmarket.connect(artist).delist(0, LicenseType.Transfer);

      const signature = await signPurchaseAcceptance(buyer, 0, listPrice, LicenseType.Transfer, licenseHash, artist.address, 0);

      await expect(
        nftmarket.connect(buyer).buy(0, LicenseType.Transfer, signature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "NotListed");
    });

    it("Should not allow insufficient payment", async function () {
      const listing = await nftmarket.getListing(0, LicenseType.Transfer);
      const signature = await signPurchaseAcceptance(
        buyer,
        0,
        listing.price,
        LicenseType.Transfer,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, LicenseType.Transfer, signature, { value: listPrice / 2n })
      ).to.be.revertedWithCustomError(nftmarket, "InsufficientPayment");
    });

    it("Should not allow buying own token", async function () {
      const listing = await nftmarket.getListing(0, LicenseType.Transfer);
      const signature = await signPurchaseAcceptance(
        artist,
        0,
        listing.price,
        LicenseType.Transfer,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      await expect(
        nftmarket.connect(artist).buy(0, LicenseType.Transfer, signature, { value: listPrice })
      ).to.be.revertedWithCustomError(nftmarket, "CannotBuyOwnToken");
    });

    it("Should refund excess payment", async function () {
      const excessAmount = ethers.parseEther("0.5");
      const totalPayment = listPrice + excessAmount;

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const listing = await nftmarket.getListing(0, LicenseType.Transfer);
      const signature = await signPurchaseAcceptance(
        buyer,
        0,
        listing.price,
        LicenseType.Transfer,
        listing.licenseHash,
        listing.seller,
        listing.nonce
      );

      const tx = await nftmarket.connect(buyer).buy(0, LicenseType.Transfer, signature, { value: totalPayment });
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

      const listing = await nftmarket.getListing(0, LicenseType.Transfer);
      expect(listing.active).to.be.false;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
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

  describe("Signature Replay Protection", function () {
    beforeEach(async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
    });

    it("Should not allow reusing listing signature after delist", async function () {
      const price = ethers.parseEther("1");
      const nonce = await nftmarket.getNonce(artist.address);
      const signature = await signListingOffer(artist, 0, price, LicenseType.Display, licenseHash, nonce, 0);

      // First listing succeeds
      await nftmarket.connect(artist).list(0, price, LicenseType.Display, licenseHash, 0, signature);
      await nftmarket.connect(artist).delist(0, 0);

      // Trying to reuse same signature should fail (nonce has incremented)
      await expect(
        nftmarket.connect(artist).list(0, price, LicenseType.Display, licenseHash, 0, signature)
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });

    it("Should not allow buyer signature for different listing nonce", async function () {
      const price = ethers.parseEther("1");

      // List once
      await listToken(artist, 0, price);
      const firstListing = await nftmarket.getListing(0, 0);

      // Delist
      await nftmarket.connect(artist).delist(0, 0);

      // List again (new nonce)
      await listToken(artist, 0, price);

      // Try to use old nonce in buyer signature
      const oldNonceSignature = await signPurchaseAcceptance(
        buyer,
        0,
        price,
        LicenseType.Display,  // firstListing was Display type (0)
        firstListing.licenseHash,
        firstListing.seller,
        firstListing.nonce // Old nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(0, 0, oldNonceSignature, { value: price })
      ).to.be.revertedWithCustomError(nftmarket, "InvalidSignature");
    });
  });

  describe("License Rights Tracking", function () {
    const price = ethers.parseEther("1");

    beforeEach(async function () {
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
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
        await nftmarket.connect(artist).delist(0, LicenseType.Display);

        await expect(listToken(artist, 0, price, LicenseType.Commercial)).to.not.be.reverted;
        await nftmarket.connect(artist).delist(0, LicenseType.Commercial);

        await expect(listToken(artist, 0, price, LicenseType.Transfer)).to.not.be.reverted;
      });

      it("Should prevent license tokens from sub-licensing", async function () {
        // Sell with Display license to buyer - this mints token 1 for buyer
        await listToken(artist, 0, price, LicenseType.Display);
        await buyToken(buyer, 0, price);

        // Buyer owns license token 1, which has Display rights
        // License tokens cannot list as Display or Commercial (no sub-licensing)
        const nonce = await nftmarket.getNonce(buyer.address);
        const signature = await signListingOffer(buyer, 1, price, LicenseType.Display, licenseHash, nonce, 0);

        await expect(
          nftmarket.connect(buyer).list(1, price, LicenseType.Display, licenseHash, 0, signature)
        ).to.be.revertedWithCustomError(nftmarket, "LicenseTokensCannotSubLicense");
      });

      it("Should allow license tokens to be sold via Transfer", async function () {
        // Sell with Commercial license to buyer - this mints token 1 for buyer
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price, LicenseType.Commercial);

        // Buyer owns license token 1, can sell it via Transfer (transfers the token itself)
        await expect(listToken(buyer, 1, price, LicenseType.Transfer)).to.not.be.reverted;
      });
    });

    describe("Display license sale (mints new token)", function () {
      beforeEach(async function () {
        await listToken(artist, 0, price, LicenseType.Display);
        await buyToken(buyer, 0, price);
        // This mints token 1 for buyer, original token 0 stays with artist
      });

      it("Should mint new token for buyer", async function () {
        // Buyer owns the new license token (1), not the original (0)
        expect(await nftmarket.ownerOf(1)).to.equal(buyer.address);
        expect(await nftmarket.ownerOf(0)).to.equal(artist.address);
      });

      it("Should give new token Display license", async function () {
        const data = await nftmarket.getTokenData(1);
        expect(data.ownerLicense).to.equal(LicenseType.Display);
        expect(data.isOriginal).to.be.false;
        expect(data.parentToken).to.equal(0);
        expect(data.originalToken).to.equal(0);
      });

      it("Original token should keep Transfer rights", async function () {
        const data = await nftmarket.getTokenData(0);
        expect(data.ownerLicense).to.equal(LicenseType.Transfer);
        expect(data.isOriginal).to.be.true;
      });

      it("Should not transfer copyright", async function () {
        const data = await nftmarket.getTokenData(1);
        expect(data.copyrightOwner).to.equal(artist.address);
      });

      it("Buyer should have display rights on their license token", async function () {
        expect(await nftmarket.checkDisplayRights(1, buyer.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(1, buyer.address)).to.be.false;
        expect(await nftmarket.checkCopyrightOwnership(1, buyer.address)).to.be.false;
      });

      it("Creator retains all rights on original", async function () {
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, artist.address)).to.be.true;
      });

      it("Should emit LicenseGranted event", async function () {
        // Need to mint and list a new token to test event
        const imageHash2 = ethers.keccak256(ethers.toUtf8Bytes("another-image"));
        const newTokenId = await reserveAndMint(minter, artist.address, tokenUri, imageHash2, ipfsUri);
        await listToken(artist, newTokenId, price, LicenseType.Display);

        const tx = await buyToken(other, newTokenId, price);
        // LicenseGranted(newTokenId, parentTokenId, originalTokenId, licensor, licensee, licenseType, licenseHash)
        // newTokenId will be the next available ID after sales above
        await expect(tx).to.emit(nftmarket, "LicenseGranted");
      });
    });

    describe("Commercial license sale (mints new token)", function () {
      beforeEach(async function () {
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price, LicenseType.Commercial);
        // This mints token 1 for buyer, original token 0 stays with artist
      });

      it("Should mint new token for buyer", async function () {
        // Buyer owns the new license token (1), not the original (0)
        expect(await nftmarket.ownerOf(1)).to.equal(buyer.address);
        expect(await nftmarket.ownerOf(0)).to.equal(artist.address);
      });

      it("Should give new token Commercial license", async function () {
        const data = await nftmarket.getTokenData(1);
        expect(data.ownerLicense).to.equal(LicenseType.Commercial);
        expect(data.isOriginal).to.be.false;
        expect(data.parentToken).to.equal(0);
      });

      it("Should not transfer copyright", async function () {
        const data = await nftmarket.getTokenData(1);
        expect(data.copyrightOwner).to.equal(artist.address);
      });

      it("Buyer should have display and commercial rights on their license token", async function () {
        expect(await nftmarket.checkDisplayRights(1, buyer.address)).to.be.true;
        expect(await nftmarket.checkCommercialRights(1, buyer.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(1, buyer.address)).to.be.false;
      });
    });

    describe("Transfer license sale (copyright transfer)", function () {
      beforeEach(async function () {
        await listToken(artist, 0, price, LicenseType.Transfer);
        await buyToken(buyer, 0, price, LicenseType.Transfer);
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
        await reserveAndMint(minter, artist.address, tokenUri, newImageHash, ipfsUri);

        await listToken(artist, 1, price, LicenseType.Transfer);

        const listing = await nftmarket.getListing(1, LicenseType.Transfer);
        const signature = await signPurchaseAcceptance(
          buyer, 1, listing.price, LicenseType.Transfer, listing.licenseHash, listing.seller, listing.nonce
        );

        await expect(nftmarket.connect(buyer).buy(1, LicenseType.Transfer, signature, { value: price }))
          .to.emit(nftmarket, "CopyrightTransferred")
          .withArgs(1, artist.address, buyer.address);
      });

      it("Should emit DisplayRightsRetained event for seller", async function () {
        const newImageHash = ethers.keccak256(ethers.toUtf8Bytes("yet-another-image"));
        await reserveAndMint(minter, artist.address, tokenUri, newImageHash, ipfsUri);

        await listToken(artist, 1, price, LicenseType.Transfer);

        const listing = await nftmarket.getListing(1, LicenseType.Transfer);
        const signature = await signPurchaseAcceptance(
          buyer, 1, listing.price, LicenseType.Transfer, listing.licenseHash, listing.seller, listing.nonce
        );

        await expect(nftmarket.connect(buyer).buy(1, LicenseType.Transfer, signature, { value: price }))
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
        await buyToken(buyer, 0, price, LicenseType.Transfer);

        // Artist retains display rights
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;

        // Buyer sells to other with Transfer
        await listToken(buyer, 0, price, LicenseType.Transfer);
        await buyToken(other, 0, price, LicenseType.Transfer);

        // Both artist and buyer retain display rights
        expect(await nftmarket.checkDisplayRights(0, artist.address)).to.be.true;
        expect(await nftmarket.checkDisplayRights(0, buyer.address)).to.be.true;

        // Other now owns copyright
        expect(await nftmarket.checkCopyrightOwnership(0, other.address)).to.be.true;
        expect(await nftmarket.checkCopyrightOwnership(0, buyer.address)).to.be.false;
      });

      it("License tokens can only be transferred, not sub-licensed", async function () {
        // Artist sells Commercial license to buyer - this mints token 1 for buyer
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price, LicenseType.Commercial);

        // Buyer owns token 1 (Commercial license)
        expect(await nftmarket.ownerOf(1)).to.equal(buyer.address);
        const data = await nftmarket.getTokenData(1);
        expect(data.ownerLicense).to.equal(LicenseType.Commercial);
        expect(data.isOriginal).to.be.false;

        // Buyer cannot sub-license (list as Display or Commercial)
        const nonce = await nftmarket.getNonce(buyer.address);
        const signature = await signListingOffer(buyer, 1, price, LicenseType.Display, licenseHash, nonce, 0);

        await expect(
          nftmarket.connect(buyer).list(1, price, LicenseType.Display, licenseHash, 0, signature)
        ).to.be.revertedWithCustomError(nftmarket, "LicenseTokensCannotSubLicense");

        // But buyer CAN list as Transfer (sells the license token itself)
        await expect(listToken(buyer, 1, price, LicenseType.Transfer)).to.not.be.reverted;
      });

      it("Should track provenance chain through license grants", async function () {
        // Artist sells Commercial license to buyer - mints token 1
        await listToken(artist, 0, price, LicenseType.Commercial);
        await buyToken(buyer, 0, price, LicenseType.Commercial);

        // Check provenance of license token
        const chain = await nftmarket.getProvenanceChain(1);
        expect(chain.length).to.equal(2);
        expect(chain[0]).to.equal(1); // Current token
        expect(chain[1]).to.equal(0); // Original token
      });
    });
  });

  describe("UUPS Upgradeability", function () {
    it("Should allow owner to upgrade implementation and preserve state", async function () {
      // First mint a token to verify state preservation
      await reserveAndMint(minter, artist.address, tokenUri, imageHash, ipfsUri);
      expect(await nftmarket.totalSupply()).to.equal(1);

      const proxyAddress = await nftmarket.getAddress();

      // Deploy a new version (same contract in this test, but demonstrates upgrade works)
      const NFTmarketNFTV2 = await ethers.getContractFactory("NFTmarketNFT");

      // Upgrade
      const upgraded = await upgrades.upgradeProxy(proxyAddress, NFTmarketNFTV2);
      await upgraded.waitForDeployment();

      // Proxy address should be the same
      expect(await upgraded.getAddress()).to.equal(proxyAddress);

      // State should be preserved after upgrade
      expect(await upgraded.name()).to.equal("NFTmarket");
      expect(await upgraded.owner()).to.equal(owner.address);
      expect(await upgraded.totalSupply()).to.equal(1);

      // Authority should still exist
      const [authAdmin, authFeeBps, authIsActive] = await upgraded.getAuthority(0);
      expect(authAdmin).to.equal(admin.address);
      expect(authFeeBps).to.equal(DEFAULT_FEE_BPS);
      expect(authIsActive).to.be.true;

      // Token data should still exist
      expect(await upgraded.ownerOf(0)).to.equal(artist.address);
    });

    it("Should not allow non-owner to upgrade", async function () {
      const proxyAddress = await nftmarket.getAddress();
      const NFTmarketNFTV2 = await ethers.getContractFactory("NFTmarketNFT", admin);

      await expect(
        upgrades.upgradeProxy(proxyAddress, NFTmarketNFTV2)
      ).to.be.revertedWithCustomError(nftmarket, "OwnableUnauthorizedAccount");
    });
  });

  // ============ Edge Case Tests ============

  describe("Fee Cap", function () {
    it("Should enforce MAX_FEE_BPS (50%) on initialize", async function () {
      const NFTmarketNFT = await ethers.getContractFactory("NFTmarketNFT");

      // Try to initialize with fee > 50%
      await expect(
        upgrades.deployProxy(
          NFTmarketNFT,
          [owner.address, admin.address, 6000], // 60% - too high
          { kind: 'uups' }
        )
      ).to.be.revertedWithCustomError(nftmarket, "FeeTooHigh");
    });

    it("Should enforce MAX_FEE_BPS on registerAuthority", async function () {
      await expect(
        nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 5001) // > 50%
      ).to.be.revertedWithCustomError(nftmarket, "FeeTooHigh");

      // 50% should be allowed
      await expect(
        nftmarket.connect(owner).registerAuthority(partnerAdmin.address, 5000)
      ).to.not.be.reverted;
    });

    it("Should enforce MAX_FEE_BPS on updateAuthorityFee", async function () {
      await expect(
        nftmarket.connect(admin).updateAuthorityFee(0, 5001) // > 50%
      ).to.be.revertedWithCustomError(nftmarket, "FeeTooHigh");

      // 50% should be allowed
      await expect(
        nftmarket.connect(admin).updateAuthorityFee(0, 5000)
      ).to.not.be.reverted;
    });
  });

  describe("Fee Withdrawal (Pull Pattern)", function () {
    let tokenId;

    beforeEach(async function () {
      // Mint a token
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const reserveReceipt = await reserveTx.wait();
      const reserveEvent = reserveReceipt.logs
        .map(log => { try { return nftmarket.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "TokenReserved");
      tokenId = reserveEvent.args.tokenId;

      await nftmarket.connect(minter).mint(
        tokenId,
        artist.address,
        tokenUri,
        imageHash,
        ipfsUri
      );
    });

    it("Should accrue fees on sale instead of direct transfer", async function () {
      const price = ethers.parseEther("1.0");

      // List token
      await listToken(artist, tokenId, price, LicenseType.Transfer);

      // Buy token - get nonce from listing, not getNonce
      const listing = await nftmarket.getListing(tokenId, LicenseType.Transfer);
      const buyerSig = await signPurchaseAcceptance(
        buyer, tokenId, price, LicenseType.Transfer, listing.licenseHash, artist.address, listing.nonce
      );

      await nftmarket.connect(buyer).buy(tokenId, LicenseType.Transfer, buyerSig, { value: price });

      // Fee should be accrued for minter, not transferred yet
      const expectedFee = (price * BigInt(DEFAULT_FEE_BPS)) / 10000n;
      expect(await nftmarket.pendingFees(minter.address)).to.equal(expectedFee);
    });

    it("Should allow minter to withdraw accrued fees", async function () {
      const price = ethers.parseEther("1.0");

      // List and sell token
      await listToken(artist, tokenId, price, LicenseType.Transfer);
      const listing = await nftmarket.getListing(tokenId, LicenseType.Transfer);
      const buyerSig = await signPurchaseAcceptance(
        buyer, tokenId, price, LicenseType.Transfer, listing.licenseHash, artist.address, listing.nonce
      );
      await nftmarket.connect(buyer).buy(tokenId, LicenseType.Transfer, buyerSig, { value: price });

      const expectedFee = (price * BigInt(DEFAULT_FEE_BPS)) / 10000n;
      const minterBalanceBefore = await ethers.provider.getBalance(minter.address);

      // Withdraw fees
      const withdrawTx = await nftmarket.connect(minter).withdrawFees();
      const receipt = await withdrawTx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const minterBalanceAfter = await ethers.provider.getBalance(minter.address);

      // Balance should increase by fee minus gas
      expect(minterBalanceAfter).to.equal(minterBalanceBefore + expectedFee - gasUsed);

      // Pending fees should be cleared
      expect(await nftmarket.pendingFees(minter.address)).to.equal(0);
    });

    it("Should revert if no fees to withdraw", async function () {
      await expect(
        nftmarket.connect(other).withdrawFees()
      ).to.be.revertedWithCustomError(nftmarket, "NoFeesToWithdraw");
    });

    it("Should emit FeeAccrued and FeeWithdrawn events", async function () {
      const price = ethers.parseEther("1.0");
      const expectedFee = (price * BigInt(DEFAULT_FEE_BPS)) / 10000n;

      // List and sell
      await listToken(artist, tokenId, price, LicenseType.Transfer);
      const listing = await nftmarket.getListing(tokenId, LicenseType.Transfer);
      const buyerSig = await signPurchaseAcceptance(
        buyer, tokenId, price, LicenseType.Transfer, listing.licenseHash, artist.address, listing.nonce
      );

      // Check FeeAccrued event on buy
      await expect(
        nftmarket.connect(buyer).buy(tokenId, LicenseType.Transfer, buyerSig, { value: price })
      ).to.emit(nftmarket, "FeeAccrued")
        .withArgs(minter.address, tokenId, expectedFee);

      // Check FeeWithdrawn event
      await expect(
        nftmarket.connect(minter).withdrawFees()
      ).to.emit(nftmarket, "FeeWithdrawn")
        .withArgs(minter.address, expectedFee);
    });
  });

  describe("Deactivated Authority", function () {
    let tokenId;

    beforeEach(async function () {
      // Mint a token under default authority
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const reserveReceipt = await reserveTx.wait();
      const reserveEvent = reserveReceipt.logs
        .map(log => { try { return nftmarket.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "TokenReserved");
      tokenId = reserveEvent.args.tokenId;

      await nftmarket.connect(minter).mint(
        tokenId,
        artist.address,
        tokenUri,
        imageHash,
        ipfsUri
      );
    });

    it("Should allow existing tokens to be listed after authority deactivation", async function () {
      // Deactivate authority
      await nftmarket.connect(owner).deactivateAuthority(0);

      // Should still be able to list existing token
      const price = ethers.parseEther("0.5");
      await expect(
        listToken(artist, tokenId, price, LicenseType.Display)
      ).to.not.be.reverted;
    });

    it("Should allow existing tokens to be sold after authority deactivation", async function () {
      const price = ethers.parseEther("0.5");

      // List token first
      await listToken(artist, tokenId, price, LicenseType.Transfer);

      // Deactivate authority
      await nftmarket.connect(owner).deactivateAuthority(0);

      // Should still be able to buy - get nonce from listing
      const listing = await nftmarket.getListing(tokenId, LicenseType.Transfer);
      const buyerSig = await signPurchaseAcceptance(
        buyer, tokenId, price, LicenseType.Transfer, listing.licenseHash, artist.address, listing.nonce
      );

      await expect(
        nftmarket.connect(buyer).buy(tokenId, LicenseType.Transfer, buyerSig, { value: price })
      ).to.not.be.reverted;

      expect(await nftmarket.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("Should still accrue fees to minter after authority deactivation", async function () {
      const price = ethers.parseEther("1.0");

      // List token
      await listToken(artist, tokenId, price, LicenseType.Transfer);

      // Deactivate authority
      await nftmarket.connect(owner).deactivateAuthority(0);

      // Buy token - get nonce from listing
      const listing = await nftmarket.getListing(tokenId, LicenseType.Transfer);
      const buyerSig = await signPurchaseAcceptance(
        buyer, tokenId, price, LicenseType.Transfer, listing.licenseHash, artist.address, listing.nonce
      );
      await nftmarket.connect(buyer).buy(tokenId, LicenseType.Transfer, buyerSig, { value: price });

      // Fees should still be accrued
      const expectedFee = (price * BigInt(DEFAULT_FEE_BPS)) / 10000n;
      expect(await nftmarket.pendingFees(minter.address)).to.equal(expectedFee);
    });

    it("Should prevent new minting after authority deactivation", async function () {
      // Deactivate authority
      await nftmarket.connect(owner).deactivateAuthority(0);

      // Try to reserve new token ID
      await expect(
        nftmarket.connect(minter).reserveTokenId()
      ).to.be.revertedWithCustomError(nftmarket, "AuthorityNotActive");
    });
  });

  describe("Provenance Chain", function () {
    it("Should track provenance for license tokens", async function () {
      // License tokens (from Display/Commercial sales) cannot be re-listed
      // But their provenance chain should still work correctly
      const price = ethers.parseEther("0.1");

      // Mint original token
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const reserveReceipt = await reserveTx.wait();
      const reserveEvent = reserveReceipt.logs
        .map(log => { try { return nftmarket.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "TokenReserved");
      const originalTokenId = reserveEvent.args.tokenId;

      await nftmarket.connect(minter).mint(
        originalTokenId,
        artist.address,
        tokenUri,
        imageHash,
        ipfsUri
      );

      // Original token has single-element chain
      const originalChain = await nftmarket.getProvenanceChain(originalTokenId);
      expect(originalChain.length).to.equal(1);
      expect(originalChain[0]).to.equal(originalTokenId);

      // Sell Display license - creates license token
      await listToken(artist, originalTokenId, price, LicenseType.Display);
      const listing = await nftmarket.getListing(originalTokenId, 0);
      const buyerSig = await signPurchaseAcceptance(
        buyer, originalTokenId, price, LicenseType.Display, listing.licenseHash, artist.address, listing.nonce
      );

      const buyTx = await nftmarket.connect(buyer).buy(originalTokenId, 0, buyerSig, { value: price });
      const buyReceipt = await buyTx.wait();

      // Find the new license token
      const licenseEvent = buyReceipt.logs
        .map(log => { try { return nftmarket.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "LicenseGranted");

      expect(licenseEvent).to.not.be.undefined;
      const licenseTokenId = licenseEvent.args.newTokenId;

      // License token chain should include parent and original
      const licenseChain = await nftmarket.getProvenanceChain(licenseTokenId);
      expect(licenseChain.length).to.equal(2);
      expect(licenseChain[0]).to.equal(licenseTokenId); // Current token
      expect(licenseChain[1]).to.equal(originalTokenId); // Parent/original

      // Verify license token cannot be re-listed (sublicense not allowed)
      await expect(
        listToken(buyer, licenseTokenId, price, LicenseType.Display)
      ).to.be.revertedWithCustomError(nftmarket, "LicenseTokensCannotSubLicense");
    });

    it("Should return single-element chain for original token", async function () {
      // Mint original token
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const reserveReceipt = await reserveTx.wait();
      const reserveEvent = reserveReceipt.logs
        .map(log => { try { return nftmarket.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "TokenReserved");
      const tokenId = reserveEvent.args.tokenId;

      const uniqueHash = ethers.keccak256(ethers.toUtf8Bytes("unique-image-for-provenance-test"));
      await nftmarket.connect(minter).mint(
        tokenId,
        artist.address,
        tokenUri,
        uniqueHash,
        ipfsUri
      );

      const chain = await nftmarket.getProvenanceChain(tokenId);
      expect(chain.length).to.equal(1);
      expect(chain[0]).to.equal(tokenId);
    });
  });
});
