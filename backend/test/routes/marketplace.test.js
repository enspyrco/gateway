/**
 * Marketplace Route Integration Tests
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
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      const res = await request(app)
        .get('/api/marketplace')
        .expect(200);

      expect(res.body.listings.length).toBe(1);
      expect(res.body.listings[0].tokenId).toBe(tokenId);
      expect(res.body.listings[0].priceEth).toBe('1.0000');
    });
  });

  describe('GET /api/marketplace/:tokenId', () => {
    it('should return listing info for listed token', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      const res = await request(app)
        .get(`/api/marketplace/${tokenId}`)
        .expect(200);

      expect(res.body.listed).toBe(true);
      expect(res.body.tokenId).toBe(tokenId);
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

  describe('POST /api/marketplace/list', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/marketplace/list')
        .send({ tokenId: 1, price: '1000000000000000000' })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should require tokenId and price', async () => {
      const res = await request(app)
        .post('/api/marketplace/list')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should list a token for sale', async () => {
      const { tokenId } = await mintToken(userA);

      const res = await request(app)
        .post('/api/marketplace/list')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({ tokenId, price: '1000000000000000000' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.tokenId).toBe(tokenId);
      expect(res.body.priceEth).toBe('1.0000');
    });

    it('should reject listing by non-owner', async () => {
      const { tokenId } = await mintToken(userA);

      const res = await request(app)
        .post('/api/marketplace/list')
        .set('Authorization', `Bearer ${authTokenB}`)
        .send({ tokenId, price: '1000000000000000000' })
        .expect(403);

      expect(res.body.code).toBe('NOT_OWNER');
    });
  });

  describe('POST /api/marketplace/delist', () => {
    it('should require authentication', async () => {
      await request(app)
        .post('/api/marketplace/delist')
        .send({ tokenId: 1 })
        .expect(401);
    });

    it('should require tokenId', async () => {
      const res = await request(app)
        .post('/api/marketplace/delist')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject delist by non-owner', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      const res = await request(app)
        .post('/api/marketplace/delist')
        .set('Authorization', `Bearer ${authTokenB}`)
        .send({ tokenId })
        .expect(403);

      expect(res.body.code).toBe('NOT_OWNER');
    });

    it('should delist a token', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      const res = await request(app)
        .post('/api/marketplace/delist')
        .set('Authorization', `Bearer ${authTokenA}`)
        .send({ tokenId })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify it's no longer listed
      const listing = await blockchainService.getListing(tokenId);
      expect(listing.active).toBe(false);
    });
  });

  describe('POST /api/marketplace/buy', () => {
    it('should require authentication', async () => {
      await request(app)
        .post('/api/marketplace/buy')
        .send({ tokenId: 1 })
        .expect(401);
    });

    it('should require tokenId', async () => {
      const res = await request(app)
        .post('/api/marketplace/buy')
        .set('Authorization', `Bearer ${authTokenB}`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject buying unlisted token', async () => {
      const { tokenId } = await mintToken(userA);

      const res = await request(app)
        .post('/api/marketplace/buy')
        .set('Authorization', `Bearer ${authTokenB}`)
        .send({ tokenId })
        .expect(400);

      expect(res.body.code).toBe('NOT_LISTED');
    });

    it('should buy a listed token', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      const res = await request(app)
        .post('/api/marketplace/buy')
        .set('Authorization', `Bearer ${authTokenB}`)
        .send({ tokenId })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.seller).toBe(userA);
      expect(res.body.buyer).toBe(userB.toLowerCase());

      // Verify ownership changed
      const isOwner = await blockchainService.isOwner(tokenId, userB);
      expect(isOwner).toBe(true);
    });
  });
});
