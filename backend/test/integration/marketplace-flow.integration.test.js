/**
 * Integration Tests: NFTmarketNFT Full Marketplace Flow
 *
 * Tests the complete flow: mint → list → buy → verify ownership
 *
 * Prerequisites:
 *   1. Start Hardhat node: cd contracts && npx hardhat node
 *   2. Deploy contract: cd contracts && npx hardhat run scripts/deploy.js --network localhost
 *   3. Set NFTMARKET_CONTRACT_ADDRESS env var to deployed address
 *
 * Run with: RUN_INTEGRATION_TESTS=true npm test -- --testPathPattern=marketplace-flow
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// Skip if not in integration test mode
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIf = RUN_INTEGRATION ? describe : describe.skip;

// NFTmarketNFT ABI (subset for testing)
const NFTMARKET_ABI = [
  // Minting
  'function mint(address to, string uri, bytes32 imageHash, string encryptedBlobUri) returns (uint256)',
  'function totalSupply() view returns (uint256)',

  // Ownership & Token Data
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getTokenData(uint256 tokenId) view returns (address creator, address currentOwner, address copyrightOwner, uint8 ownerLicense, bytes32 imageHash, uint256 mintedAt, string encryptedBlobUri, string uri)',

  // Marketplace
  'function list(uint256 tokenId, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 expiry, bytes signature) external',
  'function delist(uint256 tokenId) external',
  'function buy(uint256 tokenId, bytes signature) external payable',
  'function getListing(uint256 tokenId) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function getNonce(address account) view returns (uint256)',
  'function getDomainSeparator() view returns (bytes32)',

  // License Rights
  'function checkDisplayRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCommercialRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCopyrightOwnership(uint256 tokenId, address account) view returns (bool)',
  'function getMaxSellableLicense(uint256 tokenId) view returns (uint8)',

  // Events
  'event Minted(uint256 indexed tokenId, address indexed creator, bytes32 imageHash)',
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry)',
  'event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 licenseType, bytes32 licenseHash)',
  'event BilateralAgreement(uint256 indexed tokenId, bytes sellerSignature, bytes buyerSignature, uint256 timestamp)',
  'event CopyrightTransferred(uint256 indexed tokenId, address indexed from, address indexed to)',
  'event DisplayRightsRetained(uint256 indexed tokenId, address indexed holder)',
];

// License types (matches contract enum)
const LicenseType = {
  Display: 0,
  Commercial: 1,
  Transfer: 2,
};

// EIP-712 type definitions
const ListingOfferTypes = {
  ListingOffer: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'licenseType', type: 'uint8' },
    { name: 'licenseHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
};

const PurchaseAcceptanceTypes = {
  PurchaseAcceptance: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'licenseType', type: 'uint8' },
    { name: 'licenseHash', type: 'bytes32' },
    { name: 'seller', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
};

describeIf('NFTmarketNFT Marketplace Flow Integration Tests', () => {
  let provider;
  let artist;
  let buyer;
  let platform;
  let contract;
  let domain;

  const RPC_URL = process.env.HARDHAT_RPC_URL || 'http://127.0.0.1:8545';
  const CONTRACT_ADDRESS = process.env.NFTMARKET_CONTRACT_ADDRESS;

  // Hardhat default private keys
  const PLATFORM_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Account #0
  const ARTIST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';  // Account #1
  const BUYER_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';   // Account #2

  // Create fresh wallets to reset nonce tracking (ethers caches nonces per wallet instance)
  function createFreshWallets() {
    // Create a fresh provider to clear any cached state
    const freshProvider = new ethers.JsonRpcProvider(RPC_URL);
    return {
      provider: freshProvider,
      platform: new ethers.Wallet(PLATFORM_PRIVATE_KEY, freshProvider),
      artist: new ethers.Wallet(ARTIST_PRIVATE_KEY, freshProvider),
      buyer: new ethers.Wallet(BUYER_PRIVATE_KEY, freshProvider),
    };
  }

  beforeAll(async () => {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NFTMARKET_CONTRACT_ADDRESS env var required. Deploy contract first.');
    }

    // Initial setup for domain (doesn't need fresh wallets)
    provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    domain = {
      name: 'NFTmarket',
      version: '1',
      chainId: network.chainId,
      verifyingContract: CONTRACT_ADDRESS,
    };
  });

  beforeEach(() => {
    // Create fresh wallets before each test to reset nonce tracking
    const fresh = createFreshWallets();
    provider = fresh.provider;
    platform = fresh.platform;
    artist = fresh.artist;
    buyer = fresh.buyer;
    contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMARKET_ABI, platform);
  });

  // Helper: Get next nonce by sending a JSON-RPC request directly (bypasses caching)
  async function getNextNonce(wallet) {
    // Use direct RPC call to bypass any caching
    const count = await wallet.provider.send('eth_getTransactionCount', [wallet.address, 'latest']);
    return parseInt(count, 16);
  }

  // Small delay to let state propagate
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper: Mint a token and wait for confirmation
  async function mintToken(minter, metadataUri) {
    const minterContract = contract.connect(minter);
    const nonce = await getNextNonce(minter);
    const tx = await minterContract.mint(
      minter.address,
      metadataUri || `ipfs://QmTest${Date.now()}`,
      randomImageHash(),
      'ipfs://QmEncrypted',
      { nonce }
    );
    const receipt = await tx.wait();
    await delay(50); // Let state propagate
    const event = receipt.logs.find(log => {
      try {
        return contract.interface.parseLog(log).name === 'Minted';
      } catch {
        return false;
      }
    });
    return Number(contract.interface.parseLog(event).args.tokenId);
  }

  // Helper: Generate unique image hash
  function randomImageHash() {
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  // Helper: Generate license hash
  function randomLicenseHash() {
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  // Helper: Sign a listing offer
  async function signListingOffer(signer, tokenId, price, licenseType, licenseHash, nonce, expiry) {
    const value = {
      tokenId: BigInt(tokenId),
      price: BigInt(price),
      licenseType,
      licenseHash,
      nonce: BigInt(nonce),
      expiry: BigInt(expiry),
    };
    return signer.signTypedData(domain, ListingOfferTypes, value);
  }

  // Helper: Sign a purchase acceptance
  async function signPurchaseAcceptance(signer, tokenId, price, licenseType, licenseHash, seller, nonce) {
    const value = {
      tokenId: BigInt(tokenId),
      price: BigInt(price),
      licenseType,
      licenseHash,
      seller,
      nonce: BigInt(nonce),
    };
    return signer.signTypedData(domain, PurchaseAcceptanceTypes, value);
  }

  // Helper: List a token with explicit nonce management
  async function listToken(seller, tokenId, price, licenseType, licenseHash) {
    const sellerContract = contract.connect(seller);
    const contractNonce = await contract.getNonce(seller.address);
    const signature = await signListingOffer(seller, tokenId, price, licenseType, licenseHash, contractNonce, 0n);
    const txNonce = await getNextNonce(seller);
    const tx = await sellerContract.list(tokenId, price, licenseType, licenseHash, 0, signature, { nonce: txNonce });
    const receipt = await tx.wait();
    await delay(50); // Let state propagate
    return receipt;
  }

  // Helper: Buy a token with explicit nonce management
  async function buyToken(buyerWallet, tokenId) {
    const buyerContract = contract.connect(buyerWallet);
    const listing = await contract.getListing(tokenId);
    const buySig = await signPurchaseAcceptance(
      buyerWallet,
      tokenId,
      listing.price,
      listing.licenseType,
      listing.licenseHash,
      listing.seller,
      listing.nonce
    );
    const txNonce = await getNextNonce(buyerWallet);
    const tx = await buyerContract.buy(tokenId, buySig, { value: listing.price, nonce: txNonce });
    const receipt = await tx.wait();
    await delay(50); // Let state propagate
    return receipt;
  }

  describe('Step 1: Minting to Blockchain', () => {
    it('should mint a new NFT and verify all properties', async () => {
      const artistContract = contract.connect(artist);
      const imageHash = randomImageHash();
      const supplyBefore = await contract.totalSupply();

      // Mint with explicit nonce
      const txNonce = await getNextNonce(artist);
      const tx = await artistContract.mint(
        artist.address,
        'ipfs://QmTestMetadata123',
        imageHash,
        'ipfs://QmEncryptedBlob123',
        { nonce: txNonce }
      );
      const receipt = await tx.wait();

      // Check for Minted event
      const mintedEvent = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'Minted';
        } catch {
          return false;
        }
      });
      expect(mintedEvent).toBeDefined();

      const parsed = contract.interface.parseLog(mintedEvent);
      const tokenId = Number(parsed.args.tokenId);

      expect(parsed.args.creator).toBe(artist.address);
      expect(parsed.args.imageHash).toBe(imageHash);

      // Verify supply increased
      const supplyAfter = await contract.totalSupply();
      expect(supplyAfter).toBe(supplyBefore + 1n);

      // Verify token data
      const data = await contract.getTokenData(tokenId);
      expect(data.creator).toBe(artist.address);
      expect(data.currentOwner).toBe(artist.address);
      expect(data.copyrightOwner).toBe(artist.address);
      expect(Number(data.ownerLicense)).toBe(LicenseType.Transfer);
      expect(data.imageHash).toBe(imageHash);

      // Verify ownership
      const owner = await contract.ownerOf(tokenId);
      expect(owner).toBe(artist.address);

      // Verify creator has all rights
      expect(await contract.checkDisplayRights(tokenId, artist.address)).toBe(true);
      expect(await contract.checkCommercialRights(tokenId, artist.address)).toBe(true);
      expect(await contract.checkCopyrightOwnership(tokenId, artist.address)).toBe(true);

      // Verify can sell any license type
      const maxLicense = await contract.getMaxSellableLicense(tokenId);
      expect(Number(maxLicense)).toBe(LicenseType.Transfer);
    });
  });

  describe('Step 2: Listing for Sale', () => {
    it('should list token with Display license', async () => {
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();
      const price = ethers.parseEther('1.0');

      const receipt = await listToken(artist, tokenId, price, LicenseType.Display, licenseHash);

      // Check for Listed event
      const listedEvent = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'Listed';
        } catch {
          return false;
        }
      });

      expect(listedEvent).toBeDefined();

      const parsed = contract.interface.parseLog(listedEvent);
      expect(parsed.args.seller).toBe(artist.address);
      expect(parsed.args.price).toBe(price);
      expect(Number(parsed.args.licenseType)).toBe(LicenseType.Display);

      // Verify listing data stored correctly
      const listing = await contract.getListing(tokenId);
      expect(listing.seller).toBe(artist.address);
      expect(listing.price).toBe(price);
      expect(Number(listing.licenseType)).toBe(LicenseType.Display);
      expect(listing.licenseHash).toBe(licenseHash);
      expect(listing.active).toBe(true);
    });

    it('should reject listing by non-owner', async () => {
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();
      const price = ethers.parseEther('1.0');

      // Try to list as buyer (not owner) - should fail
      await expect(
        listToken(buyer, tokenId, price, LicenseType.Display, licenseHash)
      ).rejects.toThrow();
    });
  });

  describe('Step 3: Executing a Sale', () => {
    it('should execute purchase and verify all state changes', async () => {
      // Setup: mint and list
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();
      const price = ethers.parseEther('1.0');

      await listToken(artist, tokenId, price, LicenseType.Display, licenseHash);

      // Execute purchase
      const receipt = await buyToken(buyer, tokenId);

      // Check for Sold event
      const soldEvent = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'Sold';
        } catch {
          return false;
        }
      });
      expect(soldEvent).toBeDefined();

      const parsed = contract.interface.parseLog(soldEvent);
      expect(parsed.args.seller).toBe(artist.address);
      expect(parsed.args.buyer).toBe(buyer.address);
      expect(parsed.args.price).toBe(price);

      // Check for BilateralAgreement event
      const bilateralEvent = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'BilateralAgreement';
        } catch {
          return false;
        }
      });
      expect(bilateralEvent).toBeDefined();

      // Verify ownership transferred
      const newOwner = await contract.ownerOf(tokenId);
      expect(newOwner).toBe(buyer.address);

      // Verify buyer has Display rights only
      const data = await contract.getTokenData(tokenId);
      expect(Number(data.ownerLicense)).toBe(LicenseType.Display);
      expect(await contract.checkDisplayRights(tokenId, buyer.address)).toBe(true);
      expect(await contract.checkCommercialRights(tokenId, buyer.address)).toBe(false);
      expect(await contract.checkCopyrightOwnership(tokenId, buyer.address)).toBe(false);

      // Verify copyright remains with artist
      expect(await contract.checkCopyrightOwnership(tokenId, artist.address)).toBe(true);
      expect(await contract.checkCommercialRights(tokenId, artist.address)).toBe(true);

      // Verify listing deactivated
      const listingAfter = await contract.getListing(tokenId);
      expect(listingAfter.active).toBe(false);
    });
  });

  describe('Step 4: Full Marketplace Cycle', () => {
    it('should complete mint → list → buy → relist → buy cycle', async () => {
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();

      expect(await contract.ownerOf(tokenId)).toBe(artist.address);

      // 1. Artist lists for 1 ETH with Display license
      const price1 = ethers.parseEther('1.0');
      await listToken(artist, tokenId, price1, LicenseType.Display, licenseHash);

      expect((await contract.getListing(tokenId)).active).toBe(true);

      // 2. Buyer purchases
      await buyToken(buyer, tokenId);

      expect(await contract.ownerOf(tokenId)).toBe(buyer.address);
      expect((await contract.getListing(tokenId)).active).toBe(false);
      expect(Number((await contract.getTokenData(tokenId)).ownerLicense)).toBe(LicenseType.Display);

      // 3. Buyer relists for 2 ETH
      const price2 = ethers.parseEther('2.0');
      await listToken(buyer, tokenId, price2, LicenseType.Display, licenseHash);

      expect((await contract.getListing(tokenId)).active).toBe(true);
      expect((await contract.getListing(tokenId)).seller).toBe(buyer.address);

      // 4. Artist buys back
      await buyToken(artist, tokenId);

      expect(await contract.ownerOf(tokenId)).toBe(artist.address);
      expect(Number((await contract.getTokenData(tokenId)).ownerLicense)).toBe(LicenseType.Display);
    });
  });

  describe('Step 5: Copyright Transfer Sale', () => {
    it('should transfer copyright and retain display rights for seller', async () => {
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();

      // List with Transfer license
      const price = ethers.parseEther('10.0');
      await listToken(artist, tokenId, price, LicenseType.Transfer, licenseHash);

      // Buy
      const receipt = await buyToken(buyer, tokenId);

      // Check for CopyrightTransferred event
      const copyrightEvent = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'CopyrightTransferred';
        } catch {
          return false;
        }
      });
      expect(copyrightEvent).toBeDefined();

      // Check for DisplayRightsRetained event
      const displayEvent = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'DisplayRightsRetained';
        } catch {
          return false;
        }
      });
      expect(displayEvent).toBeDefined();

      // Verify copyright transferred to buyer
      expect(await contract.checkCopyrightOwnership(tokenId, buyer.address)).toBe(true);
      expect(await contract.checkCopyrightOwnership(tokenId, artist.address)).toBe(false);

      // Verify artist retained display rights
      expect(await contract.checkDisplayRights(tokenId, artist.address)).toBe(true);
      expect(await contract.checkCommercialRights(tokenId, artist.address)).toBe(false);

      // Verify buyer has full rights
      expect(await contract.checkDisplayRights(tokenId, buyer.address)).toBe(true);
      expect(await contract.checkCommercialRights(tokenId, buyer.address)).toBe(true);
    });
  });

  describe('Error Cases', () => {
    it('should reject buying unlisted token', async () => {
      const tokenId = await mintToken(artist);
      const buyerContract = contract.connect(buyer);
      const fakeSig = '0x' + '00'.repeat(65);
      const txNonce = await getNextNonce(buyer);

      await expect(
        buyerContract.buy(tokenId, fakeSig, { value: ethers.parseEther('1.0'), nonce: txNonce })
      ).rejects.toThrow();
    });

    it('should reject buying own token', async () => {
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();
      const price = ethers.parseEther('1.0');

      // List
      await listToken(artist, tokenId, price, LicenseType.Display, licenseHash);

      // Try to buy own token
      const listing = await contract.getListing(tokenId);
      const buySig = await signPurchaseAcceptance(artist, tokenId, listing.price, listing.licenseType, listing.licenseHash, listing.seller, listing.nonce);
      const artistContract = contract.connect(artist);
      const txNonce = await getNextNonce(artist);

      await expect(
        artistContract.buy(tokenId, buySig, { value: price, nonce: txNonce })
      ).rejects.toThrow();
    });

    it('should reject license escalation', async () => {
      const tokenId = await mintToken(artist);
      const licenseHash = randomLicenseHash();
      const price = ethers.parseEther('1.0');

      // Sell with Display
      await listToken(artist, tokenId, price, LicenseType.Display, licenseHash);
      await buyToken(buyer, tokenId);

      // Buyer now has Display license, try to list with Commercial (escalation)
      await expect(
        listToken(buyer, tokenId, price, LicenseType.Commercial, licenseHash)
      ).rejects.toThrow();
    });
  });
});
