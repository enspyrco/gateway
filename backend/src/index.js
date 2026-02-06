/**
 * NFTmarket Backend API
 * Handles: watermarking, encryption, IPFS upload, NFT minting
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const authMiddleware = require('./middleware/auth');
const mintRouter = require('./routes/mint');
const detectRouter = require('./routes/detect');
const verifyRouter = require('./routes/verify');
const marketplaceRouter = require('./routes/marketplace');
const generateRouter = require('./routes/generate');
const galleryRouter = require('./routes/gallery');
const licenseRouter = require('./routes/license');
const blockchainService = require('./services/blockchain');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Public routes
app.use('/api/verify', verifyRouter);

// Public generation styles endpoint
app.get('/api/generate/styles', (req, res) => {
  const aiService = require('./services/ai-generation');
  res.json({ styles: aiService.getStylePresets() });
});

// Mock IPFS gateway (for development only)
const ipfsService = require('./services/ipfs');
app.get('/ipfs/:hash', async (req, res) => {
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
    const hash = req.params.hash.slice(-8);
    const hue = parseInt(hash, 16) % 360;
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect width="400" height="400" fill="hsl(${hue}, 60%, 80%)"/>
      <text x="200" y="180" text-anchor="middle" font-family="system-ui" font-size="24" fill="hsl(${hue}, 60%, 30%)">NFT Image</text>
      <text x="200" y="220" text-anchor="middle" font-family="monospace" font-size="14" fill="hsl(${hue}, 60%, 40%)">${req.params.hash.slice(0, 16)}...</text>
    </svg>`);
  }
});

// Mock Arweave gateway (for development only)
const arweaveService = require('./services/arweave');
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
  const templates = {
    display: `NFTMARKET LICENSE AGREEMENT - DISPLAY\n\nThis license grants personal, non-commercial display rights only.\n\nYou MAY:\n- Display the artwork for personal enjoyment\n- Resell or transfer the NFT\n\nYou MAY NOT:\n- Use the artwork commercially\n- Create derivative works\n- Sublicense the artwork\n\nCopyright remains with the creator.`,
    commercial: `NFTMARKET LICENSE AGREEMENT - COMMERCIAL\n\nThis license grants commercial usage rights.\n\nYou MAY:\n- Display the artwork publicly or privately\n- Use the artwork in commercial projects\n- Create and sell merchandise\n- Create derivative works\n- Resell or transfer the NFT (license transfers with it)\n\nYou MAY NOT:\n- Claim original authorship\n- Sublicense independently of the NFT\n\nCopyright remains with the creator. Commercial rights transfer with the NFT.`,
    transfer: `NFTMARKET LICENSE AGREEMENT - COPYRIGHT TRANSFER\n\nThis agreement transfers full copyright ownership to you.\n\nYou receive:\n- Full copyright ownership\n- All reproduction rights\n- All derivative work rights\n- All commercial rights\n- Right to sublicense\n\nThe creator retains:\n- Moral rights (where applicable by law)\n- Right to be credited as original author\n\nThis is a complete and irrevocable transfer of copyright.`
  };

  if (!templates[type]) {
    return res.status(400).json({ error: 'Invalid license type', code: 'INVALID_LICENSE_TYPE' });
  }

  res.json({ licenseType: type, text: templates[type] });
});

// Public generated image retrieval (no auth needed for viewing)
app.get('/api/generate/:id/image/:index', (req, res) => {
  const aiService = require('./services/ai-generation');
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

// Public marketplace browsing (must be before authenticated marketplace routes)
const licenseTypeNames = ['display', 'commercial', 'transfer'];
app.get('/api/marketplace', async (req, res, next) => {
  try {
    const blockchainService = require('./services/blockchain');
    const ipfsService = require('./services/ipfs');

    const listings = await blockchainService.getActiveListings();
    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        try {
          // Get token data from blockchain (source of truth)
          const blockchainData = await blockchainService.getTokenData(listing.tokenId);

          // Use IPFS URI from blockchain
          const imageUrl = blockchainData?.ipfsUri
            ? ipfsService.getGatewayUrl(blockchainData.ipfsUri)
            : null;

          return {
            tokenId: listing.tokenId,
            name: `NFTmarket #${listing.tokenId}`,
            imageUrl,
            previewUrl: imageUrl, // backwards compatibility
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller,
            licenseType: licenseTypeNames[listing.licenseType] || 'unknown'
          };
        } catch (e) {
          return {
            tokenId: listing.tokenId,
            name: `NFTmarket #${listing.tokenId}`,
            imageUrl: null,
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller,
            licenseType: licenseTypeNames[listing.licenseType] || 'unknown'
          };
        }
      })
    );
    // Get contract info
    const domain = await blockchainService.getEIP712Domain();

    res.json({
      contract: {
        name: domain.name,
        address: domain.verifyingContract,
        chainId: domain.chainId
      },
      listings: enrichedListings
    });
  } catch (error) {
    next(error);
  }
});

// Public EIP-712 domain endpoint (needed for signing)
app.get('/api/marketplace/eip712/domain', async (req, res, next) => {
  try {
    const blockchainService = require('./services/blockchain');
    const domain = await blockchainService.getEIP712Domain();
    res.json({ domain });
  } catch (error) {
    next(error);
  }
});

// Public nonce endpoint (needed for signing)
app.get('/api/marketplace/nonce/:address', async (req, res, next) => {
  try {
    const blockchainService = require('./services/blockchain');
    const { address } = req.params;
    const nonce = await blockchainService.getNonce(address);
    res.json({ address, nonce });
  } catch (error) {
    next(error);
  }
});

// Authenticated routes
app.use('/api/mint', authMiddleware, mintRouter(upload));
app.use('/api/detect', authMiddleware, detectRouter(upload));
app.use('/api/marketplace', authMiddleware, marketplaceRouter);
app.use('/api/generate', authMiddleware, generateRouter());
app.use('/api/license', licenseRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
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

    // Start blockchain event listener for logging
    try {
      blockchainService.startEventListener({
        onMinted: async ({ tokenId, creator }) => {
          console.log(`[Event] Token ${tokenId} minted by ${creator}`);
        },
        onSold: async ({ tokenId, seller, buyer, price }) => {
          console.log(`[Event] Token ${tokenId} sold from ${seller} to ${buyer}`);
        },
        onListed: async ({ tokenId, seller, price }) => {
          console.log(`[Event] Token ${tokenId} listed by ${seller}`);
        },
        onLicenseGranted: async ({ newTokenId, parentTokenId, licensee, licenseType }) => {
          const licenseNames = ['Display', 'Commercial', 'Transfer'];
          console.log(`[Event] License token ${newTokenId} (${licenseNames[licenseType]}) granted from ${parentTokenId} to ${licensee}`);
        }
      });
      console.log('[Startup] Blockchain event listener started');
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
