/**
 * Integration Tests: NFTLicensingSystem Contract
 *
 * These tests run against a local Anvil node with NFTLicensingSystem deployed.
 *
 * Prerequisites:
 *   1. Start Anvil: cd contracts && anvil
 *   2. Deploy contract: cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
 *   3. Set CONTRACT_ADDRESS env var to deployed address
 *
 * Run with: npm test -- --testPathPattern=integration
 */

const { ethers } = require('ethers');

// Skip if not in integration test mode
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIf = RUN_INTEGRATION ? describe : describe.skip;

// NFTLicensingSystem ABI (minimal subset for testing)
const NFT_LICENSING_ABI = [
  'function createArtwork(string metadataURI) returns (uint160 artworkId)',
  'function mintLicense(uint160 artworkId, uint8 licenseType, address to) returns (uint256 tokenId)',
  'function getArtwork(uint160 artworkId) view returns (tuple(address originalMinter, uint88 commercialCount, uint88 displayCount, bool copyrightTransferred, string metadataURI))',
  'function getLicenseInfo(uint256 tokenId) view returns (tuple(uint160 artworkId, uint8 licenseType, bool isOriginalGrant, uint88 instanceId))',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function listForSale(uint256 tokenId, uint256 askingPrice)',
  'function makeOffer(uint256 tokenId) payable',
  'function acceptOffer(uint256 tokenId, uint256 offerIndex)',
  'function getListings() view returns (uint256[] tokenIds, tuple(uint256 askingPrice, bool isActive)[] listingData)',
  'function getOffers(uint256 tokenId) view returns (tuple(address offerer, uint256 amount, bool isActive)[])',
  'function pause()',
  'function unpause()',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'event ArtworkCreated(uint160 indexed artworkId, address indexed originalMinter, string metadataURI)',
  'event LicenseMinted(uint256 indexed tokenId, uint160 indexed artworkId, uint8 licenseType, address indexed to, uint88 instanceId)',
];

// License types
const LicenseType = {
  Copyright: 0,
  Commercial: 1,
  Display: 2,
};

describeIf('NFTLicensingSystem Integration Tests', () => {
  let provider;
  let owner;
  let user1;
  let user2;
  let contract;

  const RPC_URL = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
  const CONTRACT_ADDRESS = process.env.NFT_LICENSING_ADDRESS;

  // Anvil default private keys
  const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const USER1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const USER2_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

  beforeAll(async () => {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NFT_LICENSING_ADDRESS env var required. Deploy contract first.');
    }

    provider = new ethers.JsonRpcProvider(RPC_URL);
    owner = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
    user1 = new ethers.Wallet(USER1_PRIVATE_KEY, provider);
    user2 = new ethers.Wallet(USER2_PRIVATE_KEY, provider);

    contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_LICENSING_ABI, owner);

    // Ensure contract is not paused
    const isPaused = await contract.paused();
    if (isPaused) {
      await contract.unpause();
    }
  });

  describe('Artwork Creation', () => {
    it('should create an artwork and emit event', async () => {
      const metadataURI = 'ipfs://QmTestArtwork123';

      const tx = await contract.createArtwork(metadataURI);
      const receipt = await tx.wait();

      // Find ArtworkCreated event
      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed.name === 'ArtworkCreated';
        } catch {
          return false;
        }
      });

      expect(event).toBeDefined();

      const parsed = contract.interface.parseLog(event);
      expect(parsed.args.originalMinter).toBe(owner.address);
      expect(parsed.args.metadataURI).toBe(metadataURI);
    });

    it('should store artwork data correctly', async () => {
      const metadataURI = 'ipfs://QmTestArtwork456';

      const tx = await contract.createArtwork(metadataURI);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'ArtworkCreated';
        } catch {
          return false;
        }
      });

      const artworkId = contract.interface.parseLog(event).args.artworkId;
      const artwork = await contract.getArtwork(artworkId);

      expect(artwork.originalMinter).toBe(owner.address);
      expect(artwork.metadataURI).toBe(metadataURI);
      expect(artwork.copyrightTransferred).toBe(false);
    });
  });

  describe('License Minting', () => {
    let artworkId;

    beforeAll(async () => {
      const tx = await contract.createArtwork('ipfs://QmLicenseTestArtwork');
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'ArtworkCreated';
        } catch {
          return false;
        }
      });

      artworkId = contract.interface.parseLog(event).args.artworkId;
    });

    it('should mint a Display license', async () => {
      const tx = await contract.mintLicense(artworkId, LicenseType.Display, user1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'LicenseMinted';
        } catch {
          return false;
        }
      });

      expect(event).toBeDefined();

      const parsed = contract.interface.parseLog(event);
      expect(Number(parsed.args.licenseType)).toBe(LicenseType.Display);
      expect(parsed.args.to).toBe(user1.address);
    });

    it('should mint a Commercial license', async () => {
      const tx = await contract.mintLicense(artworkId, LicenseType.Commercial, user2.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'LicenseMinted';
        } catch {
          return false;
        }
      });

      const parsed = contract.interface.parseLog(event);
      expect(Number(parsed.args.licenseType)).toBe(LicenseType.Commercial);
    });

    it('should track license info correctly', async () => {
      const tx = await contract.mintLicense(artworkId, LicenseType.Display, user1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'LicenseMinted';
        } catch {
          return false;
        }
      });

      const tokenId = contract.interface.parseLog(event).args.tokenId;
      const licenseInfo = await contract.getLicenseInfo(tokenId);

      expect(licenseInfo.artworkId).toBe(artworkId);
      expect(Number(licenseInfo.licenseType)).toBe(LicenseType.Display);
    });
  });

  describe('Marketplace', () => {
    let artworkId;
    let tokenId;

    beforeAll(async () => {
      // Create artwork and mint a transferable license (Display can be resold once)
      const artworkTx = await contract.createArtwork('ipfs://QmMarketplaceTestArtwork');
      const artworkReceipt = await artworkTx.wait();

      const artworkEvent = artworkReceipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'ArtworkCreated';
        } catch {
          return false;
        }
      });

      artworkId = contract.interface.parseLog(artworkEvent).args.artworkId;

      // Mint Display license to user1
      const mintTx = await contract.mintLicense(artworkId, LicenseType.Display, user1.address);
      const mintReceipt = await mintTx.wait();

      const mintEvent = mintReceipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'LicenseMinted';
        } catch {
          return false;
        }
      });

      tokenId = contract.interface.parseLog(mintEvent).args.tokenId;
    });

    it('should list a token for sale', async () => {
      const user1Contract = contract.connect(user1);
      const askingPrice = ethers.parseEther('1.0');

      const tx = await user1Contract.listForSale(tokenId, askingPrice);
      await tx.wait();

      const [tokenIds, listings] = await contract.getListings();

      const index = tokenIds.findIndex(id => id === tokenId);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(listings[index].isActive).toBe(true);
      expect(listings[index].askingPrice).toBe(askingPrice);
    });

    it('should allow making an offer', async () => {
      const user2Contract = contract.connect(user2);
      const offerAmount = ethers.parseEther('0.5');

      const tx = await user2Contract.makeOffer(tokenId, { value: offerAmount });
      await tx.wait();

      const offers = await contract.getOffers(tokenId);

      const offer = offers.find(o => o.offerer === user2.address && o.isActive);
      expect(offer).toBeDefined();
      expect(offer.amount).toBe(offerAmount);
    });
  });

  describe('Pause Mechanism', () => {
    it('should allow owner to pause', async () => {
      await contract.pause();

      const isPaused = await contract.paused();
      expect(isPaused).toBe(true);
    });

    it('should prevent operations when paused', async () => {
      const isPaused = await contract.paused();
      if (!isPaused) {
        await contract.pause();
      }

      await expect(
        contract.createArtwork('ipfs://QmShouldFail')
      ).rejects.toThrow();
    });

    it('should allow owner to unpause', async () => {
      await contract.unpause();

      const isPaused = await contract.paused();
      expect(isPaused).toBe(false);
    });

    it('should allow operations after unpause', async () => {
      const isPaused = await contract.paused();
      if (isPaused) {
        await contract.unpause();
      }

      const tx = await contract.createArtwork('ipfs://QmShouldWork');
      const receipt = await tx.wait();

      expect(receipt.status).toBe(1);
    });
  });
});
