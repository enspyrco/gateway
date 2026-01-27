/**
 * Generate Route Tests
 */

const request = require('supertest');
const crypto = require('crypto');

const app = require('../../src/index');
const aiService = require('../../src/services/ai-generation');

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

describe('Generate Route', () => {
  const testWallet = '0x1234567890123456789012345678901234567890';
  let authToken;

  beforeAll(() => {
    authToken = createMockAuthToken(testWallet);
  });

  beforeEach(() => {
    aiService.resetMock();
  });

  describe('GET /api/generate/styles', () => {
    it('should return available style presets', async () => {
      const res = await request(app)
        .get('/api/generate/styles')
        .expect(200);

      expect(res.body.styles).toBeDefined();
      expect(Array.isArray(res.body.styles)).toBe(true);
      expect(res.body.styles.length).toBeGreaterThan(0);
      expect(res.body.styles[0]).toHaveProperty('id');
      expect(res.body.styles[0]).toHaveProperty('name');
    });
  });

  describe('POST /api/generate', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/generate')
        .send({ prompt: 'test prompt' })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should require a prompt', async () => {
      const res = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe('MISSING_PROMPT');
    });

    it('should reject empty prompt', async () => {
      const res = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: '   ' })
        .expect(400);

      expect(res.body.code).toBe('MISSING_PROMPT');
    });

    it('should reject prompt over 1000 characters', async () => {
      const res = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'a'.repeat(1001) })
        .expect(400);

      expect(res.body.code).toBe('PROMPT_TOO_LONG');
    });

    it('should generate images with valid prompt', async () => {
      const res = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'a beautiful sunset', style: 'photographic', count: 4 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.generationId).toBeDefined();
      expect(res.body.prompt).toBe('a beautiful sunset');
      expect(res.body.style).toBe('photographic');
      expect(res.body.images).toBeDefined();
      expect(res.body.images.length).toBe(4);
      expect(res.body.images[0]).toHaveProperty('id');
      expect(res.body.images[0]).toHaveProperty('seed');
      expect(res.body.images[0]).toHaveProperty('url');
    });

    it('should generate single image when count is 1', async () => {
      const res = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'test', count: 1 })
        .expect(201);

      expect(res.body.images.length).toBe(1);
    });

    it('should default to 4 images for invalid count', async () => {
      const res = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'test', count: 10 })
        .expect(201);

      expect(res.body.images.length).toBe(4);
    });
  });

  describe('GET /api/generate/:id', () => {
    it('should return 404 for non-existent generation', async () => {
      const res = await request(app)
        .get('/api/generate/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('should return generation details', async () => {
      // First create a generation
      const createRes = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'test prompt' })
        .expect(201);

      const generationId = createRes.body.generationId;

      // Then retrieve it
      const res = await request(app)
        .get(`/api/generate/${generationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.generationId).toBe(generationId);
      expect(res.body.prompt).toBe('test prompt');
      expect(res.body.images).toBeDefined();
    });
  });

  describe('GET /api/generate/:id/image/:index (public)', () => {
    it('should return image without auth', async () => {
      // First create a generation
      const createRes = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'test' })
        .expect(201);

      const generationId = createRes.body.generationId;

      // Then retrieve image without auth
      const res = await request(app)
        .get(`/api/generate/${generationId}/image/0`)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/png');
    });

    it('should return 404 for invalid index', async () => {
      const createRes = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'test', count: 1 })
        .expect(201);

      const generationId = createRes.body.generationId;

      await request(app)
        .get(`/api/generate/${generationId}/image/5`)
        .expect(404);
    });
  });
});
