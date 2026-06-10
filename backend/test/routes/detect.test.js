/**
 * Detection Route Tests
 * Tests for the blind watermark detection endpoint
 */

const request = require('supertest');
const crypto = require('crypto');
const zlib = require('zlib');

const app = require('../../src/index');

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

/**
 * Create a valid 1x1 PNG image
 */
function createTestImage(r = 255, g = 0, b = 0) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00
  ]);
  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from('IHDR'),
    ihdrData,
    ihdrCrc
  ]);

  const rawPixel = Buffer.from([0x00, r, g, b]);
  const compressed = zlib.deflateSync(rawPixel, { level: 9 });
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length);
  const idat = Buffer.concat([
    idatLen,
    Buffer.from('IDAT'),
    compressed,
    idatCrc
  ]);

  const iendCrc = crc32(Buffer.from('IEND'));
  const iend = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('IEND'),
    iendCrc
  ]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function crc32(data) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  const result = Buffer.alloc(4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return result;
}

describe('Detection Routes', () => {
  const testWallet = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  let authToken;

  beforeEach(() => {
    authToken = createMockAuthToken(testWallet);
  });

  describe('POST /api/detect/blind', () => {
    it('should require authentication', async () => {
      const testImage = createTestImage();

      const response = await request(app)
        .post('/api/detect/blind')
        .attach('image', testImage, 'test.png');

      expect(response.status).toBe(401);
    });

    it('should require an image file', async () => {
      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_IMAGE');
    });

    it('should return detection result for valid image', async () => {
      const testImage = createTestImage();

      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', testImage, 'test.png');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('detected');
      expect(typeof response.body.detected).toBe('boolean');
    });

    it('should return not detected for unwatermarked image in mock mode', async () => {
      const testImage = createTestImage(128, 128, 128);

      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', testImage, 'gray.png');

      expect(response.status).toBe(200);
      expect(response.body.detected).toBe(false);
      expect(response.body.confidence).toBe(0);
    });

    it('should accept different image formats', async () => {
      // PNG with different color
      const blueImage = createTestImage(0, 0, 255);

      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', blueImage, 'blue.png');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('detected');
    });

    it('should return message when no watermark detected', async () => {
      const testImage = createTestImage();

      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', testImage, 'test.png');

      // In mock mode, detection always returns not detected
      if (!response.body.detected) {
        expect(response.body.message).toBe('No watermark detected in this image');
      }
    });
  });

  describe('runBlindDetection function behavior', () => {
    // These tests verify the output parsing logic

    it('should handle empty detection response', async () => {
      const testImage = createTestImage();

      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', testImage, 'test.png');

      expect(response.status).toBe(200);
      // Mock mode returns empty detection
      expect(response.body.detected).toBe(false);
      expect(response.body.confidence).toBe(0);
    });

    it('should return proper structure for detection result', async () => {
      const testImage = createTestImage();

      const response = await request(app)
        .post('/api/detect/blind')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', testImage, 'test.png');

      expect(response.status).toBe(200);

      // Verify response structure
      expect(response.body).toHaveProperty('detected');
      expect(response.body).toHaveProperty('confidence');
      expect(response.body).toHaveProperty('message');

      // Types
      expect(typeof response.body.detected).toBe('boolean');
      expect(typeof response.body.confidence).toBe('number');
    });
  });

  describe('GET /api/detect/token/:tokenId (public)', () => {
    it('should not require authentication', async () => {
      const res = await request(app).get('/api/detect/token/999999');
      // 404 (unknown token), NOT 401 — the route is public
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('TOKEN_NOT_FOUND');
    });

    it('should reject non-numeric token ids', async () => {
      const res = await request(app).get('/api/detect/token/abc');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TOKEN_ID');
    });

    it('should reject negative and non-canonical ids', async () => {
      expect((await request(app).get('/api/detect/token/-1')).status).toBe(400);
      expect((await request(app).get('/api/detect/token/1.5')).status).toBe(400);
      expect((await request(app).get('/api/detect/token/01')).status).toBe(400);
    });

    it('should decode a minted token and cache the result', async () => {
      // Mint a token through the mock pipeline first
      const mintRes = await request(app)
        .post('/api/mint')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', createTestImage(1, 2, 3), 'decode-target.png')
        .field('name', 'Decode target')
        .field('licenseType', 'display')
        .field('licenseSignature', '0x' + 'a'.repeat(64));
      expect(mintRes.status).toBe(201);
      const tokenId = mintRes.body.tokenId;

      const first = await request(app).get(`/api/detect/token/${tokenId}`);
      expect(first.status).toBe(200);
      expect(first.body.tokenId).toBe(tokenId);
      expect(typeof first.body.detected).toBe('boolean');
      expect(typeof first.body.verified).toBe('boolean');
      expect(first.body.cached).toBe(false);
      // Mock watermark mode can't really decode; verified must not be claimed
      expect(first.body.verified).toBe(false);

      const second = await request(app).get(`/api/detect/token/${tokenId}`);
      expect(second.status).toBe(200);
      expect(second.body.cached).toBe(true);
    });
  });
});
