/**
 * NFTmarket Backend API
 * Handles: watermarking, IPFS upload, NFT minting, blind detection
 */

require('dotenv').config();
require('./config'); // Fail-fast validation of env vars
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const authMiddleware = require("./middleware/auth");
const requireAdmin = require("./middleware/require-admin");
const mintRouter = require('./routes/mint');
const detectRouter = require('./routes/detect');
const verifyRouter = require('./routes/verify');
const marketplaceRouter = require('./routes/marketplace');
const generateRouter = require('./routes/generate');
const galleryRouter = require('./routes/gallery');
const licenseRouter = require('./routes/license');
const perceptualRouter = require('./routes/perceptual');
const blockchainService = require('./services/blockchain');
const ipfsService = require('./services/ipfs');
const arweaveService = require('./services/arweave');
const tokenRepository = require('./services/token-repository');
const aiService = require('./services/ai-generation');
const perceptualService = require('./services/perceptual');
const { getLicenseTemplate, getLicenseTypeName } = require('./utils/license-utils');
const { registerSink } = require('./events/dispatch');
const { stdoutSink } = require('./events/sinks/stdout');
const { jsonLogSink } = require('./events/sinks/json-log');
const requestId = require('./middleware/request-id');

// Register event sinks — mutually exclusive to avoid double logging
if (process.env.NODE_ENV === 'production') {
  registerSink(jsonLogSink);
} else {
  registerSink(stdoutSink);
}

const app = express();

// Behind Caddy in production: trust the first proxy hop so req.ip reflects
// the client (X-Forwarded-For), not the Docker bridge. Without this, every
// client shares one rate-limit bucket.
app.set('trust proxy', 1);
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WEBP images are allowed'));
    }
  }
});

// Middleware
const { ALLOWED_ORIGINS } = require('./config');
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());
app.use(requestId);

// Global rate limiting — 100 requests per 15 minutes per IP.
// /ipfs is excluded: image fetches (~30 per gallery load) would exhaust the
// global budget; it has its own higher per-route limiter below.
const rateLimit = require('express-rate-limit');
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/ipfs/'),
  message: { error: 'Too many requests', code: 'RATE_LIMITED' }
}));

// Request logging (with request ID for correlation)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] [${req.id}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'nftmarket-api',
    version: '1.0.0'
  });
});

const startTime = Date.now();

app.get('/health', async (req, res) => {
  const checks = { blockchain: 'unknown' };

  // Probe blockchain connectivity (3s timeout)
  try {
    const supplyPromise = blockchainService.totalSupply();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    const supply = await Promise.race([supplyPromise, timeoutPromise]);
    checks.blockchain = { status: 'ok', tokenCount: supply };
  } catch (err) {
    checks.blockchain = { status: 'error', message: err.message };
  }

  const mockServices = [];
  if (process.env.USE_MOCK_BLOCKCHAIN === 'true') mockServices.push('blockchain');
  if (process.env.USE_MOCK_IPFS === 'true') mockServices.push('ipfs');
  if (process.env.USE_MOCK_ARWEAVE === 'true') mockServices.push('arweave');
  if (process.env.USE_MOCK_WATERMARK === 'true') mockServices.push('watermark');
  if (process.env.USE_MOCK_AI === 'true') mockServices.push('ai');

  const allOk = checks.blockchain?.status === 'ok';

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
    mockServices: mockServices.length > 0 ? mockServices : undefined,
  });
});

// Public routes
app.use('/api/verify', verifyRouter);

// Public generation styles endpoint
app.get('/api/generate/styles', (req, res) => {
  res.json({ styles: aiService.getStylePresets() });
});

// IPFS gateway. With USE_MOCK_IPFS=true (the deployed default), every NFT
// image URL routes through here (see services/ipfs.js getGatewayUrl), so it
// must stay reachable in production. It serves images to <img> tags, so it
// cannot be auth-gated; instead it gets its own rate limit to prevent
// economic drain via the proxy.
const ipfsGatewayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // a gallery page load fetches ~30 images
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' }
});
app.get('/ipfs/:hash', ipfsGatewayLimiter, async (req, res) => {
  try {
    const data = await ipfsService.fetch(`ipfs://${req.params.hash}`);
    // CORS headers for Flutter web
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
    // Guess content type from data
    if (data[0] === 0x89 && data[1] === 0x50) {
      res.type('image/png');
    } else if (data[0] === 0xff && data[1] === 0xd8) {
      res.type('image/jpeg');
    } else if (data[0] === 0x7b) {
      res.type('application/json');
    }
    res.send(data);
  } catch (e) {
    // Return a placeholder SVG for missing mock images
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
    res.type('image/svg+xml');
    const hash = req.params.hash.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    const hue = parseInt(hash, 16) % 360;
    const safeLabel = req.params.hash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect width="400" height="400" fill="hsl(${hue}, 60%, 80%)"/>
      <text x="200" y="180" text-anchor="middle" font-family="system-ui" font-size="24" fill="hsl(${hue}, 60%, 30%)">NFT Image</text>
      <text x="200" y="220" text-anchor="middle" font-family="monospace" font-size="14" fill="hsl(${hue}, 60%, 40%)">${safeLabel}...</text>
    </svg>`);
  }
});

// Mock Arweave gateway (for development only)
app.get('/arweave/:txId', async (req, res) => {
  try {
    const data = await arweaveService.fetchData(req.params.txId);
    res.type('application/json');
    res.send(data);
  } catch (e) {
    res.status(404).json({ error: 'Not found' });
  }
});

// Public mint info routes (no auth needed)
app.get('/api/mint/price', (req, res) => {
  res.json({
    display: { usd: 1.00, description: 'Personal display rights' },
    commercial: { usd: 5.00, description: 'Commercial usage rights' },
    transfer: { usd: 10.00, description: 'Full copyright transfer' }
  });
});

app.get('/api/mint/license/:type', (req, res) => {
  const { type } = req.params;
  const text = getLicenseTemplate(type);

  if (!text) {
    return res.status(400).json({ error: 'Invalid license type', code: 'INVALID_LICENSE_TYPE' });
  }

  res.json({ licenseType: type, text });
});

// Public generated image retrieval (no auth needed for viewing)
app.get('/api/generate/:id/image/:index', (req, res) => {
  const generation = aiService.getGeneration(req.params.id);

  if (!generation) {
    return res.status(404).json({ error: 'Generation not found', code: 'NOT_FOUND' });
  }

  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || index < 0 || index >= generation.images.length) {
    return res.status(404).json({ error: 'Image not found', code: 'NOT_FOUND' });
  }

  const image = generation.images[index];
  const buffer = Buffer.from(image.base64, 'base64');

  res.set('Content-Type', 'image/png');
  res.set('Content-Length', buffer.length);
  res.send(buffer);
});

// Public gallery viewing (no auth needed)
app.use('/api/gallery', galleryRouter);

// Authenticated routes
app.use('/api/mint', authMiddleware, mintRouter(upload));
app.use('/api/detect', authMiddleware, detectRouter(upload));
// Marketplace has mixed auth: GET routes are public, POST routes use authMiddleware internally
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/generate', authMiddleware, generateRouter());
app.use('/api/license', licenseRouter);
// Perceptual matching for infringement detection (print-camera, merchandise)
// Stats endpoint is public for transparency
app.get('/api/perceptual/stats', (req, res) => {
  res.json(perceptualService.getStats());
});
app.use('/api/perceptual', authMiddleware, perceptualRouter(upload));

// Admin IPFS management endpoints (authenticated)
app.get('/api/admin/ipfs/pins', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const pins = await ipfsService.listPins({ limit });
    res.json({ count: pins.length, pins });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/ipfs/unpin/:cid', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { cid } = req.params;
    const [success] = await ipfsService.unpin(cid);
    res.json({
      cid,
      unpinned: success,
      message: success ? 'Successfully unpinned' : 'Was not pinned or already unpinned'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/ipfs/unpin', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { cids } = req.body;
    if (!Array.isArray(cids) || cids.length === 0) {
      return res.status(400).json({ error: 'cids array required', code: 'INVALID_REQUEST' });
    }

    const results = await Promise.all(
      cids.map(async (cid) => {
        const [unpinned] = await ipfsService.unpin(cid);
        return { cid, unpinned };
      })
    );

    const unpinnedCount = results.filter(r => r.unpinned).length;
    res.json({
      total: cids.length,
      unpinned: unpinnedCount,
      results
    });
  } catch (error) {
    next(error);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: status >= 500 && isProduction
      ? 'Internal server error'
      : err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  });
});

const PORT = process.env.PORT || 3000;

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, async () => {
    console.log(`NFTmarket API running on port ${PORT}`);

    // Log blockchain token count on startup
    try {
      const supply = await blockchainService.totalSupply();
      console.log(`[Startup] Blockchain has ${supply} tokens`);
    } catch (err) {
      console.warn('[Startup] Could not connect to blockchain:', err.message);
    }

    // Start blockchain event listener for logging + cache invalidation
    try {
      // Callbacks handle cache invalidation only — logging is handled by
      // the event-sink system (dispatch in real-service.js)
      blockchainService.startEventListener({
        onMinted: async ({ tokenId, creator }) => {
          tokenRepository.onTokenMinted({ tokenId, creator });
        },
        onSold: async ({ tokenId, seller, buyer }) => {
          tokenRepository.onTokenSold({ tokenId, seller, buyer });
        },
        onListed: async () => {
          tokenRepository.onListingChanged();
        },
        onLicenseGranted: async () => {}
      });
    } catch (err) {
      console.warn('[Startup] Could not start event listener:', err.message);
    }
  });

  // Configure keep-alive to avoid connection issues
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // Graceful shutdown - properly close connections when killed
  function shutdown(signal) {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    // Force exit after 5 seconds if connections don't close
    setTimeout(() => {
      console.log('Forcing exit');
      process.exit(0);
    }, 5000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
