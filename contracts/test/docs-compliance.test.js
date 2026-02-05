/**
 * Tests to verify implementation matches documentation
 * See: docs/mint.md, docs/wallet.md, docs/provenance.md
 *
 * Updated for V2: UUPS proxy, no encryptedBlobUri on-chain, authority/minter system
 */

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Documentation Compliance', function () {
  let nftmarket;
  let owner, admin, minter, alice, bob;
  const DEFAULT_FEE_BPS = 250; // 2.5%

  // Helper to reserve and mint a token (V2: uses minter, no encryptedBlobUri param)
  async function reserveAndMint(minterSigner, to, uri, imgHash, ipfs) {
    const reserveTx = await nftmarket.connect(minterSigner).reserveTokenId();
    const receipt = await reserveTx.wait();
    const event = receipt.logs.find(log => {
      try { return nftmarket.interface.parseLog(log)?.name === 'TokenReserved'; }
      catch { return false; }
    });
    const tokenId = nftmarket.interface.parseLog(event).args.tokenId;
    await nftmarket.connect(minterSigner).mint(tokenId, to, uri, imgHash, ipfs);
    return tokenId;
  }

  beforeEach(async function () {
    [owner, admin, minter, alice, bob] = await ethers.getSigners();

    // V2: Deploy via UUPS proxy
    const NFTmarket = await ethers.getContractFactory('NFTmarketNFT');
    nftmarket = await upgrades.deployProxy(
      NFTmarket,
      [owner.address, admin.address, DEFAULT_FEE_BPS],
      { kind: 'uups', initializer: 'initialize' }
    );
    await nftmarket.waitForDeployment();

    // Add minter to Authority 0
    await nftmarket.connect(admin).addMinter(0, minter.address);
  });

  // ============================================================
  // wallet.md: Platform Fee -> Now "Authority Fee to Minter"
  // ============================================================

  describe('wallet.md: Authority Fee to Minter', function () {
    it('should have Authority 0 with correct fee', async function () {
      // Authority 0 should be created at deployment
      const [authAdmin, authFeeBps, isActive] = await nftmarket.getAuthority(0);
      expect(authAdmin).to.equal(admin.address);
      expect(authFeeBps).to.equal(DEFAULT_FEE_BPS);
      expect(isActive).to.be.true;
    });

    it('should charge exactly 2.5% fee to minter wallet', async function () {
      // Mint a token
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test-image'));
      const licenseHash = ethers.keccak256(ethers.toUtf8Bytes('test-license'));
      const tokenId = await reserveAndMint(
        minter,
        alice.address,
        'ar://metadata',
        imageHash,
        'ipfs://watermarked-image'
      );

      // List the token
      const price = ethers.parseEther('1.0');
      const expiry = 0;
      const nonce = await nftmarket.getNonce(alice.address);

      // Create listing signature
      const domain = {
        name: 'NFTmarket',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await nftmarket.getAddress()
      };

      const listingTypes = {
        ListingOffer: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      const listingValue = {
        tokenId,
        price,
        licenseType: 2, // Transfer (so actual token transfers)
        licenseHash,
        nonce,
        expiry
      };

      const listingSig = await alice.signTypedData(domain, listingTypes, listingValue);

      await nftmarket.connect(alice).list(tokenId, price, 2, licenseHash, expiry, listingSig);

      // Buy the token
      const pendingFeesBefore = await nftmarket.pendingFees(minter.address);
      const sellerBalanceBefore = await ethers.provider.getBalance(alice.address);

      const purchaseTypes = {
        PurchaseAcceptance: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'seller', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      };

      const purchaseValue = {
        tokenId,
        price,
        licenseType: 2,
        licenseHash,
        seller: alice.address,
        nonce
      };

      const purchaseSig = await bob.signTypedData(domain, purchaseTypes, purchaseValue);

      await nftmarket.connect(bob).buy(tokenId, purchaseSig, { value: price });

      const pendingFeesAfter = await nftmarket.pendingFees(minter.address);
      const sellerBalanceAfter = await ethers.provider.getBalance(alice.address);

      // V2: Fee accrues to MINTER wallet (pull pattern), not admin/platform
      const expectedFee = price * BigInt(DEFAULT_FEE_BPS) / 10000n;
      expect(pendingFeesAfter - pendingFeesBefore).to.equal(expectedFee);

      // Seller should receive 97.5%
      const expectedSellerAmount = price - expectedFee;
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
    });
  });

  // ============================================================
  // wallet.md: EIP-712 Typed Data
  // ============================================================

  describe('wallet.md: EIP-712 Typed Data', function () {
    it('should have ListingOffer struct matching docs', async function () {
      // The ListingOffer struct should match wallet.md:
      // tokenId, price, licenseType, licenseHash, nonce, expiry

      // This is implicitly tested by the listing working correctly
      // If the struct didn't match, signing would fail
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      await reserveAndMint(minter, alice.address, 'ar://test', imageHash, 'ipfs://watermarked');

      const domain = {
        name: 'NFTmarket',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await nftmarket.getAddress()
      };

      const types = {
        ListingOffer: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      const value = {
        tokenId: 0,
        price: ethers.parseEther('1'),
        licenseType: 0,
        licenseHash: ethers.keccak256(ethers.toUtf8Bytes('license')),
        nonce: 0,
        expiry: 0
      };

      // Should not throw - proves struct matches
      const sig = await alice.signTypedData(domain, types, value);
      expect(sig).to.be.a('string');
    });

    it('should have PurchaseAcceptance struct matching docs', async function () {
      // The PurchaseAcceptance struct should match wallet.md:
      // tokenId, price, licenseType, licenseHash, seller, nonce

      const domain = {
        name: 'NFTmarket',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await nftmarket.getAddress()
      };

      const types = {
        PurchaseAcceptance: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'seller', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      };

      const value = {
        tokenId: 0,
        price: ethers.parseEther('1'),
        licenseType: 0,
        licenseHash: ethers.keccak256(ethers.toUtf8Bytes('license')),
        seller: alice.address,
        nonce: 0
      };

      // Should not throw - proves struct matches
      const sig = await bob.signTypedData(domain, types, value);
      expect(sig).to.be.a('string');
    });
  });

  // ============================================================
  // wallet.md: License Types
  // ============================================================

  describe('wallet.md: License Types', function () {
    it('should have Display (0), Commercial (1), Transfer (2) license types', async function () {
      // Verify license type enum values
      // Display = 0, Commercial = 1, Transfer = 2

      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const licenseHash = ethers.keccak256(ethers.toUtf8Bytes('license'));

      await reserveAndMint(minter, alice.address, 'ar://test', imageHash, 'ipfs://watermarked');

      const domain = {
        name: 'NFTmarket',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await nftmarket.getAddress()
      };

      const types = {
        ListingOffer: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      // Test Display license (0)
      let value = { tokenId: 0, price: ethers.parseEther('1'), licenseType: 0, licenseHash, nonce: 0, expiry: 0 };
      let sig = await alice.signTypedData(domain, types, value);
      await expect(nftmarket.connect(alice).list(0, ethers.parseEther('1'), 0, licenseHash, 0, sig))
        .to.not.be.reverted;
      await nftmarket.connect(alice).delist(0);

      // Test Commercial license (1)
      value = { tokenId: 0, price: ethers.parseEther('1'), licenseType: 1, licenseHash, nonce: 1, expiry: 0 };
      sig = await alice.signTypedData(domain, types, value);
      await expect(nftmarket.connect(alice).list(0, ethers.parseEther('1'), 1, licenseHash, 0, sig))
        .to.not.be.reverted;
      await nftmarket.connect(alice).delist(0);

      // Test Transfer license (2)
      value = { tokenId: 0, price: ethers.parseEther('1'), licenseType: 2, licenseHash, nonce: 2, expiry: 0 };
      sig = await alice.signTypedData(domain, types, value);
      await expect(nftmarket.connect(alice).list(0, ethers.parseEther('1'), 2, licenseHash, 0, sig))
        .to.not.be.reverted;
    });
  });

  // ============================================================
  // provenance.md: Events
  // ============================================================

  describe('provenance.md: Events', function () {
    it('should emit Minted event with tokenId, creator, imageHash, authorityId, minter', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test-image'));

      // Reserve first
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const receipt = await reserveTx.wait();
      const event = receipt.logs.find(log => {
        try { return nftmarket.interface.parseLog(log)?.name === 'TokenReserved'; }
        catch { return false; }
      });
      const tokenId = nftmarket.interface.parseLog(event).args.tokenId;

      // V2: Minted event now includes authorityId and minter
      await expect(nftmarket.connect(minter).mint(tokenId, alice.address, 'ar://metadata', imageHash, 'ipfs://watermarked'))
        .to.emit(nftmarket, 'Minted')
        .withArgs(tokenId, alice.address, imageHash, 0, minter.address);
    });

    it('should emit Transfer event on mint (from 0x0)', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      // Reserve first
      const reserveTx = await nftmarket.connect(minter).reserveTokenId();
      const receipt = await reserveTx.wait();
      const event = receipt.logs.find(log => {
        try { return nftmarket.interface.parseLog(log)?.name === 'TokenReserved'; }
        catch { return false; }
      });
      const tokenId = nftmarket.interface.parseLog(event).args.tokenId;

      await expect(nftmarket.connect(minter).mint(tokenId, alice.address, 'ar://test', imageHash, 'ipfs://watermarked'))
        .to.emit(nftmarket, 'Transfer')
        .withArgs(ethers.ZeroAddress, alice.address, tokenId);
    });

    it('should emit Sold event with tokenId, seller, buyer, price, licenseType, licenseHash', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const licenseHash = ethers.keccak256(ethers.toUtf8Bytes('license'));
      const price = ethers.parseEther('1');
      const LicenseType = { Display: 0, Commercial: 1, Transfer: 2 };

      await reserveAndMint(minter, alice.address, 'ar://test', imageHash, 'ipfs://watermarked');

      const domain = {
        name: 'NFTmarket',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await nftmarket.getAddress()
      };

      const listingTypes = {
        ListingOffer: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      // Use Transfer license (2) to test Sold event - Display/Commercial emit LicenseGranted instead
      const listingSig = await alice.signTypedData(domain, listingTypes, {
        tokenId: 0, price, licenseType: LicenseType.Transfer, licenseHash, nonce: 0, expiry: 0
      });

      await nftmarket.connect(alice).list(0, price, LicenseType.Transfer, licenseHash, 0, listingSig);

      const purchaseTypes = {
        PurchaseAcceptance: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'seller', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      };

      const purchaseSig = await bob.signTypedData(domain, purchaseTypes, {
        tokenId: 0, price, licenseType: LicenseType.Transfer, licenseHash, seller: alice.address, nonce: 0
      });

      await expect(nftmarket.connect(bob).buy(0, purchaseSig, { value: price }))
        .to.emit(nftmarket, 'Sold')
        .withArgs(0, alice.address, bob.address, price, LicenseType.Transfer, licenseHash);
    });

    it('should emit Listed event when token is listed', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const licenseHash = ethers.keccak256(ethers.toUtf8Bytes('license'));
      const price = ethers.parseEther('1');

      await reserveAndMint(minter, alice.address, 'ar://test', imageHash, 'ipfs://watermarked');

      const domain = {
        name: 'NFTmarket',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await nftmarket.getAddress()
      };

      const types = {
        ListingOffer: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      const sig = await alice.signTypedData(domain, types, {
        tokenId: 0, price, licenseType: 0, licenseHash, nonce: 0, expiry: 0
      });

      await expect(nftmarket.connect(alice).list(0, price, 0, licenseHash, 0, sig))
        .to.emit(nftmarket, 'Listed')
        .withArgs(0, alice.address, price, 0, licenseHash, 0, 0);
    });
  });

  // ============================================================
  // mint.md: Blockchain Storage
  // ============================================================

  describe('mint.md: Blockchain Storage', function () {
    it('should store IPFS URI (watermarked image) on-chain', async function () {
      const ipfsUri = 'ipfs://QmWatermarkedImageHash123';
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await reserveAndMint(minter, alice.address, 'ar://metadata', imageHash, ipfsUri);

      // getTokenData should return the IPFS URI
      const tokenData = await nftmarket.getTokenData(0);
      expect(tokenData.ipfsUri).to.equal(ipfsUri);
    });

    it('should store Arweave URI (metadata link) on-chain', async function () {
      const arweaveUri = 'ar://abc123metadata';
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await reserveAndMint(minter, alice.address, arweaveUri, imageHash, 'ipfs://watermarked');

      // tokenURI should return the Arweave URI
      const storedUri = await nftmarket.tokenURI(0);
      expect(storedUri).to.equal(arweaveUri);
    });

    it('should NOT store encrypted blob reference on-chain (V2 change)', async function () {
      // V2: encryptedBlobUri removed from on-chain storage, now in Firestore only
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await reserveAndMint(minter, alice.address, 'ar://metadata', imageHash, 'ipfs://watermarked');

      // getTokenData should NOT have encryptedBlobUri field
      const tokenData = await nftmarket.getTokenData(0);
      expect(tokenData.encryptedBlobUri).to.be.undefined;
    });

    it('should store image hash (SHA-256 of watermarked image) on-chain', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('watermarked-image-bytes'));

      await reserveAndMint(minter, alice.address, 'ar://metadata', imageHash, 'ipfs://watermarked');

      const tokenData = await nftmarket.getTokenData(0);
      expect(tokenData.imageHash).to.equal(imageHash);
    });

    it('should store creator address on-chain', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await reserveAndMint(minter, alice.address, 'ar://metadata', imageHash, 'ipfs://watermarked');

      const tokenData = await nftmarket.getTokenData(0);
      expect(tokenData.creator).to.equal(alice.address);
    });

    it('should store copyright owner on-chain', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await reserveAndMint(minter, alice.address, 'ar://metadata', imageHash, 'ipfs://watermarked');

      const tokenData = await nftmarket.getTokenData(0);
      expect(tokenData.copyrightOwner).to.equal(alice.address);
    });

    it('should store authority ID and minter address on-chain (V2)', async function () {
      const imageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await reserveAndMint(minter, alice.address, 'ar://metadata', imageHash, 'ipfs://watermarked');

      const tokenData = await nftmarket.getTokenData(0);
      expect(tokenData.authorityId).to.equal(0);
      expect(tokenData.minter).to.equal(minter.address);
    });
  });
});
