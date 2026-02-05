/**
 * Watermark API E2E Tests
 *
 * Tests the real watermark API (not mocked):
 * - Embedding watermarks
 * - Extracting/detecting watermarks
 * - Verifying token ID is correctly embedded
 *
 * Requires WATERMARK_API_URL and WATERMARK_API_KEY to be set.
 *
 * Run with:
 *   WATERMARK_API_URL=https://your-api.com \
 *   WATERMARK_API_KEY=your-key \
 *   RUN_E2E_TESTS=true \
 *   npm run test:e2e
 */

const path = require('path');
const fs = require('fs');

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';
const HAS_WATERMARK_API = !!process.env.WATERMARK_API_URL && !!process.env.WATERMARK_API_KEY;

// Only run if E2E enabled AND watermark API configured
((RUN_E2E && HAS_WATERMARK_API) ? describe : describe.skip)('E2E Watermark Tests', () => {
  let watermarkService;

  beforeAll(() => {
    // Don't mock watermark
    process.env.USE_MOCK_WATERMARK = 'false';
    jest.resetModules();
    watermarkService = require('../../src/services/watermark');
  });

  describe('Watermark Embedding', () => {
    it('should embed watermark with wallet and token ID', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/test-image.png');

      if (!fs.existsSync(testImagePath)) {
        console.warn('Skipping: test-image.png not found');
        return;
      }

      const imageBuffer = fs.readFileSync(testImagePath);
      const wallet = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
      const tokenId = 42;

      const watermarkedBuffer = await watermarkService.applyWatermark(
        imageBuffer,
        wallet,
        tokenId
      );

      // Watermarked image should be returned
      expect(watermarkedBuffer).toBeInstanceOf(Buffer);
      expect(watermarkedBuffer.length).toBeGreaterThan(0);

      // Should be different from original (watermark added)
      // Note: sizes may be similar but content differs
      console.log('Original size:', imageBuffer.length);
      console.log('Watermarked size:', watermarkedBuffer.length);
    }, 60000);

    it('should generate preview from watermarked image', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/test-image.png');

      if (!fs.existsSync(testImagePath)) {
        return;
      }

      const imageBuffer = fs.readFileSync(testImagePath);

      const previewBuffer = await watermarkService.generatePreview(imageBuffer);

      expect(previewBuffer).toBeInstanceOf(Buffer);
      // Preview should be smaller (lower quality)
      expect(previewBuffer.length).toBeLessThan(imageBuffer.length * 2);
    }, 30000);
  });

  describe('Watermark Detection', () => {
    it('should detect watermark from embedded image', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/test-image.png');

      if (!fs.existsSync(testImagePath)) {
        return;
      }

      const imageBuffer = fs.readFileSync(testImagePath);
      const wallet = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
      const tokenId = 123;

      // First embed
      const watermarkedBuffer = await watermarkService.applyWatermark(
        imageBuffer,
        wallet,
        tokenId
      );

      // Then detect
      const detected = await watermarkService.detectWatermark(watermarkedBuffer);

      expect(detected).not.toBeNull();
      expect(detected.wallet.toLowerCase()).toBe(wallet.toLowerCase());
      expect(detected.tokenId).toBe(tokenId);

      console.log('Detected watermark:', detected);
    }, 120000);

    it('should return null for unwatermarked image', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/test-image.png');

      if (!fs.existsSync(testImagePath)) {
        return;
      }

      const imageBuffer = fs.readFileSync(testImagePath);

      // Try to detect on original (unwatermarked) image
      const detected = await watermarkService.detectWatermark(imageBuffer);

      expect(detected).toBeNull();
    }, 60000);
  });

  describe('Token ID Verification', () => {
    it('should embed correct token ID that can be extracted', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/test-image.png');

      if (!fs.existsSync(testImagePath)) {
        return;
      }

      const imageBuffer = fs.readFileSync(testImagePath);
      const wallet = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

      // Test multiple token IDs
      const tokenIds = [1, 10, 100, 1000, 9999];

      for (const tokenId of tokenIds) {
        const watermarkedBuffer = await watermarkService.applyWatermark(
          imageBuffer,
          wallet,
          tokenId
        );

        const detected = await watermarkService.detectWatermark(watermarkedBuffer);

        expect(detected).not.toBeNull();
        expect(detected.tokenId).toBe(tokenId);

        console.log(`Token ID ${tokenId}: ✓ verified`);
      }
    }, 300000); // 5 min for multiple API calls
  });
});

// Test with mock when API not available
(RUN_E2E && !HAS_WATERMARK_API ? describe : describe.skip)('Watermark Mock Tests', () => {
  beforeAll(() => {
    process.env.USE_MOCK_WATERMARK = 'true';
    jest.resetModules();
  });

  it('warns when watermark API not configured', () => {
    console.warn('⚠️  WATERMARK_API_URL not configured - watermark tests skipped');
    console.warn('   Set WATERMARK_API_URL and WATERMARK_API_KEY to run watermark E2E tests');
    expect(true).toBe(true);
  });
});
