/**
 * Marketplace Route Integration Tests
 *
 * NOTE: The marketplace now uses EIP-712 typed data for signing.
 * List/buy/delist operations are performed directly on the smart contract.
 * The API provides typed data for signing and read-only endpoints.
 */

const request = require('supertest');
const crypto = require('crypto');

const app = require('../../src/index');
const blockchainService = require('../../src/services/blockchain');

// Helper to create a mock auth token (SIWE format, dev mode)
function createMockAuthToken(walletAddress) {
  const message = `localhost wants you to sign in with your Ethereum account:
${walletAddress}

Sign in to NFTmarket

URI: http://localhost:3000
Version: 1
Chain ID: 137
Nonce: ${crypto.randomBytes(8).toString('hex')}
Issued At: ${new Date().toISOString()}
Expiration Time: ${new Date(Date.now() + 3600000).toISOString()}`;

  const signature = '0x' + crypto.createHash('sha256').update(message).digest('hex');
  const token = Buffer.from(JSON.stringify({ message, signature })).toString('base64');
  return token;
}

describe('Marketplace Route', () => {
  const userA = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const userB = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
  const mockLicenseHash = '0x' + 'a'.repeat(64);
  let authTokenA, authTokenB;

  beforeAll(() => {
    authTokenA = createMockAuthToken(userA);
    authTokenB = createMockAuthToken(userB);
  });

  beforeEach(() => {
    blockchainService.resetMock();
  });

  async function mintToken(owner) {
    return blockchainService.mint(
      owner,
      'ipfs://metadata',
      0,
      '0x' + crypto.randomBytes(32).toString('hex'),
      '0x' + 'b'.repeat(64),
      'ipfs://encrypted'
    );
  }

  describe('GET /api/marketplace', () => {
    it('should return empty listings when none exist', async () => {
      const res = await request(app)
        .get('/api/marketplace')
        .expect(200);

      expect(res.body.listings).toEqual([]);
    });

    it('should return active listings', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', 'display', mockLicenseHash, userA);

      const res = await request(app)
        .get('/api/marketplace')
        .expect(200);

      expect(res.body.listings.length).toBe(1);
      expect(res.body.listings[0].tokenId).toBe(tokenId);
      expect(res.body.listings[0].priceEth).toBe('1.0000');
    });
  });

  describe('GET /api/marketplace/:tokenId', () => {
    it('should return listing details for listed token', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', 'display', mockLicenseHash, userA);

      const res = await request(app)
        .get(`/api/marketplace/${tokenId}`)
        .expect(200);

      expect(res.body.listed).toBe(true);
      expect(res.body.tokenId).toBe(tokenId);
      expect(res.body.seller).toBe(userA);
      expect(res.body.priceEth).toBe('1.0000');
    });

    it('should return listed=false for unlisted token', async () => {
      const { tokenId } = await mintToken(userA);

      const res = await request(app)
        .get(`/api/marketplace/${tokenId}`)
        .expect(200);

      expect(res.body.listed).toBe(false);
    });
  });

  describe('POST /api/marketplace/list (deprecated)', () => {
    it('should return USE_WALLET_DIRECTLY', async () => {
      const res = await request(app)
        .post('/api/marketplace/list')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({ tokenId: 1, price: '1000000000000000000' })
        .expect(400);

      expect(res.body.code).toBe('USE_WALLET_DIRECTLY');
      expect(res.body.hint).toContain('typed-data');
    });
  });

  describe('POST /api/marketplace/delist (deprecated)', () => {
    it('should return USE_WALLET_DIRECTLY', async () => {
      const res = await request(app)
        .post('/api/marketplace/delist')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({ tokenId: 1 })
        .expect(400);

      expect(res.body.code).toBe('USE_WALLET_DIRECTLY');
    });
  });

  describe('POST /api/marketplace/buy (deprecated)', () => {
    it('should return USE_WALLET_DIRECTLY', async () => {
      const res = await request(app)
        .post('/api/marketplace/buy')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({ tokenId: 1 })
        .expect(400);

      expect(res.body.code).toBe('USE_WALLET_DIRECTLY');
      expect(res.body.hint).toContain('typed-data');
    });
  });
});
