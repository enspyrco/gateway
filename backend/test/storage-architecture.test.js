/**
 * Storage Architecture Tests
 *
 * Verifies that data is stored in the correct locations:
 * - Blockchain: token ownership, IPFS URI, Arweave URI, license type, provenance
 * - Arweave: metadata JSON (name, description), license documents
 * - IPFS: watermarked preview images
 * - Firebase Storage: encrypted original images
 * - Firestore: ONLY reference to encrypted original (storagePath + keyId)
 * - KMS: encryption keys
 */

const request = require('supertest');

// Set up mock environment before requiring app
process.env.USE_MOCK_WATERMARK = 'true';
process.env.USE_MOCK_IPFS = 'true';
process.env.USE_MOCK_ARWEAVE = 'true';
process.env.USE_MOCK_FIRESTORE = 'true';
process.env.USE_MOCK_STORAGE = 'true';
process.env.USE_MOCK_BLOCKCHAIN = 'true';
process.env.USE_KMS = 'false';
process.env.DEV_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.MOCK_PERSISTENCE = 'false';

const app = require('../src/index');

// Mock auth middleware to inject wallet
jest.mock('../src/middleware/auth', () => {
  return (req, res, next) => {
    req.wallet = '0x1234567890123456789012345678901234567890';
    req.walletAddress = '0x1234567890123456789012345678901234567890';
    next();
  };
});

describe('Storage Architecture', () => {
  beforeEach(() => {
    // Reset all mock services
    const firestoreService = require('../src/services/firestore');
    const blockchainService = require('../src/services/blockchain');
    const ipfsService = require('../src/services/ipfs');
    const arweaveService = require('../src/services/arweave');
    const storageService = require('../src/services/storage');

    if (firestoreService.resetMock) firestoreService.resetMock();
    if (blockchainService.resetMock) blockchainService.resetMock();
    if (ipfsService.resetMock) ipfsService.resetMock();
    if (storageService.resetMock) storageService.resetMock();
  });

  describe('Firestore stores ONLY encrypted original reference', () => {
    it('should only have storeEncryptedRef and getEncryptedRef functions', () => {
      const firestoreService = require('../src/services/firestore');

      // Should have these functions
      expect(typeof firestoreService.storeEncryptedRef).toBe('function');
      expect(typeof firestoreService.getEncryptedRef).toBe('function');

      // Should NOT have these old functions
      expect(firestoreService.createToken).toBeUndefined();
      expect(firestoreService.getToken).toBeUndefined();
      expect(firestoreService.getTokensByWallet).toBeUndefined();
      expect(firestoreService.getTokensByOwner).toBeUndefined();
      expect(firestoreService.updateToken).toBeUndefined();
      expect(firestoreService.storeKey).toBeUndefined();
      expect(firestoreService.getKey).toBeUndefined();
      expect(firestoreService.storeLicenseInfo).toBeUndefined();
      expect(firestoreService.getLicenseInfo).toBeUndefined();
      expect(firestoreService.logDetection).toBeUndefined();
      expect(firestoreService.getDetectionHistory).toBeUndefined();
      expect(firestoreService.getGalleryList).toBeUndefined();
    });

    it('storeEncryptedRef should only store storagePath, keyId, imageHash', async () => {
      const firestoreService = require('../src/services/firestore');

      await firestoreService.storeEncryptedRef(1, {
        storagePath: 'encrypted/test.bin',
        keyId: 'key-123',
        imageHash: 'abc123'
      });

      const ref = await firestoreService.getEncryptedRef(1);

      expect(ref).toBeDefined();
      expect(ref.storagePath).toBe('encrypted/test.bin');
      expect(ref.keyId).toBe('key-123');
      expect(ref.imageHash).toBe('abc123');
      expect(ref.tokenId).toBe(1);
      expect(ref.createdAt).toBeDefined();

      // Should NOT have token metadata
      expect(ref.name).toBeUndefined();
      expect(ref.description).toBeUndefined();
      expect(ref.wallet).toBeUndefined();
      expect(ref.ipfsUri).toBeUndefined();
      expect(ref.metadataUri).toBeUndefined();
    });
  });

  describe('Gallery reads from blockchain + IPFS only', () => {
    it('GET /api/gallery should not import or use firestoreService for token data', () => {
      const gallerySource = require('fs').readFileSync(
        require.resolve('../src/routes/gallery.js'),
        'utf8'
      );

      // Should NOT import firestoreService
      expect(gallerySource).not.toMatch(/require.*firestore/);

      // Should import blockchain and ipfs
      expect(gallerySource).toMatch(/require.*blockchain/);
      expect(gallerySource).toMatch(/require.*ipfs/);
    });

    it('GET /api/gallery/:address should return tokens from blockchain', async () => {
      const blockchainService = require('../src/services/blockchain');

      // Reserve then mint a token
      const reservation = await blockchainService.reserveTokenId();
      await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata123',
        2, // transfer license
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://image123',
        'encrypted/test.bin'
      );

      const res = await request(app)
        .get('/api/gallery/0x1234567890123456789012345678901234567890');

      expect(res.status).toBe(200);
      expect(res.body.tokens).toBeDefined();
      expect(res.body.tokens.length).toBe(1);
      expect(res.body.tokens[0].tokenId).toBe(0);
      expect(res.body.tokens[0].ipfsUri).toBe('ipfs://image123');
      expect(res.body.tokens[0].metadataUri).toBe('ar://metadata123');
    });
  });

  describe('Marketplace reads from blockchain + Arweave', () => {
    it('marketplace.js should not import firestoreService', () => {
      const marketplaceSource = require('fs').readFileSync(
        require.resolve('../src/routes/marketplace.js'),
        'utf8'
      );

      // Should NOT import firestoreService
      expect(marketplaceSource).not.toMatch(/require.*firestore/);

      // Should import blockchain and arweave
      expect(marketplaceSource).toMatch(/require.*blockchain/);
      expect(marketplaceSource).toMatch(/require.*arweave/);
    });
  });

  describe('Verify reads from blockchain + Arweave', () => {
    it('verify.js should not import firestoreService', () => {
      const verifySource = require('fs').readFileSync(
        require.resolve('../src/routes/verify.js'),
        'utf8'
      );

      // Should NOT import firestoreService
      expect(verifySource).not.toMatch(/require.*firestore/);

      // Should import blockchain and arweave
      expect(verifySource).toMatch(/require.*blockchain/);
      expect(verifySource).toMatch(/require.*arweave/);
    });

    it('GET /api/verify/:tokenId should get data from blockchain', async () => {
      const blockchainService = require('../src/services/blockchain');

      // Reserve then mint a token
      const reservation = await blockchainService.reserveTokenId();
      await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata123',
        2,
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://image123',
        'encrypted/test.bin'
      );

      const res = await request(app).get('/api/verify/0');

      expect(res.status).toBe(200);
      expect(res.body.tokenId).toBe(0);
      expect(res.body.creator).toBe('0x1234567890123456789012345678901234567890');
      expect(res.body.verified).toBe(true);
    });
  });

  describe('License reads from blockchain + Arweave', () => {
    it('license.js should not import firestoreService', () => {
      const licenseSource = require('fs').readFileSync(
        require.resolve('../src/routes/license.js'),
        'utf8'
      );

      // Should NOT import firestoreService
      expect(licenseSource).not.toMatch(/require.*firestore/);

      // Should import blockchain and arweave
      expect(licenseSource).toMatch(/require.*blockchain/);
      expect(licenseSource).toMatch(/require.*arweave/);
    });

    it('GET /api/license/:tokenId should get data from blockchain', async () => {
      const blockchainService = require('../src/services/blockchain');

      // Reserve then mint a token
      const reservation = await blockchainService.reserveTokenId();
      await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata123',
        2, // transfer license
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://image123',
        'encrypted/test.bin'
      );

      const res = await request(app).get('/api/license/0');

      expect(res.status).toBe(200);
      expect(res.body.tokenId).toBe(0);
      expect(res.body.ownerLicense).toBe(2);
      expect(res.body.ownerLicenseName).toBe('Transfer');
      expect(res.body.creator).toBeDefined();
      expect(res.body.copyrightOwner).toBeDefined();
    });
  });

  describe('Detect uses Firestore only for encrypted ref', () => {
    it('detect.js should import firestoreService only for getEncryptedRef', () => {
      const detectSource = require('fs').readFileSync(
        require.resolve('../src/routes/detect.js'),
        'utf8'
      );

      // Should import firestoreService (for encrypted ref only)
      expect(detectSource).toMatch(/require.*firestore/);

      // Should use getEncryptedRef
      expect(detectSource).toMatch(/firestoreService\.getEncryptedRef/);

      // Should NOT use old functions
      expect(detectSource).not.toMatch(/firestoreService\.getToken/);
      expect(detectSource).not.toMatch(/firestoreService\.logDetection/);
    });
  });

  describe('Mint stores data in correct locations', () => {
    it('mint.js should use storeEncryptedRef, not createToken', () => {
      const mintSource = require('fs').readFileSync(
        require.resolve('../src/routes/mint.js'),
        'utf8'
      );

      // Should use storeEncryptedRef
      expect(mintSource).toMatch(/firestoreService\.storeEncryptedRef/);

      // Should NOT use createToken
      expect(mintSource).not.toMatch(/firestoreService\.createToken/);
    });
  });

  describe('Arweave service has fetchMetadata', () => {
    it('should have fetchMetadata function', () => {
      const arweaveService = require('../src/services/arweave');
      expect(typeof arweaveService.fetchMetadata).toBe('function');
    });

    it('fetchMetadata should parse ar:// URIs', async () => {
      const arweaveService = require('../src/services/arweave');

      // First upload some metadata
      const { txId } = await arweaveService.uploadJson({
        name: 'Test NFT',
        description: 'Test description'
      });

      // Then fetch it using ar:// URI format
      const metadata = await arweaveService.fetchMetadata(`ar://${txId}`);

      expect(metadata.name).toBe('Test NFT');
      expect(metadata.description).toBe('Test description');
    });
  });

  describe('Mock persistence is disabled', () => {
    it('MOCK_PERSISTENCE should be false', () => {
      expect(process.env.MOCK_PERSISTENCE).toBe('false');
    });

    it('persistence module should not write files when disabled', () => {
      const persistence = require('../src/services/mock-persistence');
      const fs = require('fs');
      const path = require('path');

      // Save should be a no-op
      const testMap = new Map([['key', 'value']]);
      persistence.saveMap('test-no-write', testMap);

      // File should not exist
      const filePath = path.join(persistence.getDir(), 'test-no-write.json');
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });
});
