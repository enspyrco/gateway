/**
 * AI Generation API routes
 * POST /api/generate - Generate images from prompt
 * GET /api/generate/styles - Get available style presets
 * GET /api/generate/:id - Get a specific generation
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const aiService = require('../services/ai-generation');

// Rate limit: 10 generations per hour per wallet (Stability AI is expensive)
// Skip rate limiting in test mode to avoid open handles from MemoryStore timers
const generateLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()  // No-op middleware for tests
  : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10,
      keyGenerator: (req) => req.wallet || 'anonymous',
      message: {
        error: 'Too many generation requests. Please try again later.',
        code: 'RATE_LIMITED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      validate: { xForwardedForHeader: false },
    });

function createRouter() {
  const router = express.Router();

  /**
   * GET /api/generate/styles
   * Returns available style presets (public)
   */
  router.get('/styles', (req, res) => {
    const styles = aiService.getStylePresets();
    res.json({ styles });
  });

  /**
   * POST /api/generate
   * Generate images from a text prompt
   *
   * Body (JSON):
   * - prompt: string (required) - Text description of desired image
   * - style: string (optional) - Style preset ID (default: 'photographic')
   * - count: number (optional) - Number of images to generate (1 or 4, default: 4)
   *
   * Returns:
   * - generationId: string
   * - images: Array<{url: string, seed: number}>
   */
  router.post('/', generateLimiter, async (req, res, next) => {
    const generationId = uuidv4();

    try {
      const { prompt, style = 'photographic', count = 4 } = req.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({
          error: 'Prompt is required',
          code: 'MISSING_PROMPT'
        });
      }

      if (prompt.length > 1000) {
        return res.status(400).json({
          error: 'Prompt must be 1000 characters or less',
          code: 'PROMPT_TOO_LONG'
        });
      }

      const validCounts = [1, 4];
      const imageCount = validCounts.includes(count) ? count : 4;

      console.log(`[${generationId}] Generating ${imageCount} images for: "${prompt.substring(0, 50)}..."`);

      // Generate images
      const results = await aiService.generateImage(prompt, style, imageCount);

      // Store generation data (images as base64 for retrieval)
      const images = results.map((result, index) => ({
        id: `${generationId}-${index}`,
        base64: result.buffer.toString('base64'),
        seed: result.seed,
      }));

      aiService.storeGeneration(generationId, {
        prompt,
        style,
        wallet: req.wallet,
        images,
      });

      console.log(`[${generationId}] Generation complete`);

      // Return URLs for retrieving images
      res.status(201).json({
        success: true,
        generationId,
        prompt,
        style,
        images: images.map(img => ({
          id: img.id,
          seed: img.seed,
          url: `/api/generate/${generationId}/image/${img.id.split('-').pop()}`,
        })),
      });

    } catch (error) {
      console.error(`[${generationId}] Generation failed:`, error);
      next(error);
    }
  });

  /**
   * GET /api/generate/:id
   * Get generation details
   */
  router.get('/:id', (req, res) => {
    const generation = aiService.getGeneration(req.params.id);

    if (!generation) {
      return res.status(404).json({
        error: 'Generation not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      generationId: req.params.id,
      prompt: generation.prompt,
      style: generation.style,
      createdAt: generation.createdAt,
      images: generation.images.map((img, index) => ({
        id: img.id,
        seed: img.seed,
        url: `/api/generate/${req.params.id}/image/${index}`,
      })),
    });
  });

  /**
   * GET /api/generate/:id/image/:index
   * Get a specific generated image
   */
  router.get('/:id/image/:index', (req, res) => {
    const generation = aiService.getGeneration(req.params.id);

    if (!generation) {
      return res.status(404).json({
        error: 'Generation not found',
        code: 'NOT_FOUND'
      });
    }

    const index = parseInt(req.params.index, 10);
    if (isNaN(index) || index < 0 || index >= generation.images.length) {
      return res.status(404).json({
        error: 'Image not found',
        code: 'NOT_FOUND'
      });
    }

    const image = generation.images[index];
    const buffer = Buffer.from(image.base64, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  });

  return router;
}

module.exports = createRouter;
