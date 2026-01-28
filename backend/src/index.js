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

// Public listing info (no auth needed for viewing)
app.get('/api/marketplace/:tokenId', async (req, res, next) => {
  try {
    const blockchainService = require('./services/blockchain');
    const tokenId = Number(req.params.tokenId);
    const listing = await blockchainService.getListing(tokenId);

    if (!listing.active) {
      return res.json({ listed: false });
    }

    res.json({
      listed: true,
      tokenId,
      seller: listing.seller,
      price: listing.price,
      priceEth: (Number(listing.price) / 1e18).toFixed(4)
    });
  } catch (e) {
    res.json({ listed: false });
  }
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
app.get('/api/marketplace', async (req, res, next) => {
  try {
    const blockchainService = require('./services/blockchain');
    const firestoreService = require('./services/firestore');
    const ipfsService = require('./services/ipfs');

    const listings = await blockchainService.getActiveListings();
    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        try {
          const tokenData = await firestoreService.getToken(listing.tokenId);
          const previewUrl = tokenData?.previewUri
            ? ipfsService.getGatewayUrl(tokenData.previewUri)
            : null;
          return {
            tokenId: listing.tokenId,
            name: tokenData?.name || `NFTmarket #${listing.tokenId}`,
            previewUrl,
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller,
            licenseType: tokenData?.licenseType || 'unknown'
          };
        } catch (e) {
          return {
            tokenId: listing.tokenId,
            name: `NFTmarket #${listing.tokenId}`,
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller
          };
        }
      })
    );
    res.json({ listings: enrichedListings });
  } catch (error) {
    next(error);
  }
});

// Authenticated routes
app.use('/api/mint', authMiddleware, mintRouter(upload));
app.use('/api/detect', authMiddleware, detectRouter(upload));
app.use('/api/marketplace', authMiddleware, marketplaceRouter);
app.use('/api/generate', authMiddleware, generateRouter());

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
  app.listen(PORT, () => {
    console.log(`NFTmarket API running on port ${PORT}`);
  });
}

module.exports = app;
