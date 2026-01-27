/**
 * Marketplace API routes
 * Buy, sell, and browse NFTs
 */

const express = require('express');
const router = express.Router();

const blockchainService = require('../services/blockchain');
const firestoreService = require('../services/firestore');
const ipfsService = require('../services/ipfs');

/**
 * GET /api/marketplace
 * Get all active listings
 */
router.get('/', async (req, res, next) => {
  try {
    const listings = await blockchainService.getActiveListings();

    // Enrich with metadata
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
            previewUrl: null,
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

/**
 * GET /api/marketplace/:tokenId
 * Get listing details for a specific token
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const { tokenId } = req.params;
    const listing = await blockchainService.getListing(tokenId);

    if (!listing.active) {
      return res.json({ listed: false });
    }

    res.json({
      listed: true,
      tokenId: Number(tokenId),
      seller: listing.seller,
      price: listing.price,
      priceEth: (Number(listing.price) / 1e18).toFixed(4)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/list
 * List a token for sale
 *
 * Body: { tokenId, price }
 * price should be in wei (string)
 */
router.post('/list', async (req, res, next) => {
  try {
    const { tokenId, price } = req.body;

    if (!tokenId || !price) {
      return res.status(400).json({
        error: 'Missing tokenId or price',
        code: 'MISSING_FIELDS'
      });
    }

    // Verify ownership
    const isOwner = await blockchainService.isOwner(tokenId, req.wallet);
    if (!isOwner) {
      return res.status(403).json({
        error: 'You do not own this token',
        code: 'NOT_OWNER'
      });
    }

    const result = await blockchainService.listToken(tokenId, price, req.wallet);

    console.log(`[MARKETPLACE] Token ${tokenId} listed for ${price} wei by ${req.wallet}`);

    res.json({
      success: true,
      tokenId: Number(tokenId),
      price,
      priceEth: (Number(price) / 1e18).toFixed(4),
      transactionHash: result.transactionHash
    });
  } catch (error) {
    console.error('[MARKETPLACE] List error:', error.message);
    next(error);
  }
});

/**
 * POST /api/marketplace/delist
 * Remove a listing
 *
 * Body: { tokenId }
 */
router.post('/delist', async (req, res, next) => {
  try {
    const { tokenId } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        error: 'Missing tokenId',
        code: 'MISSING_FIELDS'
      });
    }

    // Verify ownership before delisting
    const isOwner = await blockchainService.isOwner(tokenId, req.wallet);
    if (!isOwner) {
      return res.status(403).json({
        error: 'You do not own this token',
        code: 'NOT_OWNER'
      });
    }

    const result = await blockchainService.delistToken(tokenId, req.wallet);

    console.log(`[MARKETPLACE] Token ${tokenId} delisted by ${req.wallet}`);

    res.json({
      success: true,
      tokenId: Number(tokenId),
      transactionHash: result.transactionHash
    });
  } catch (error) {
    console.error('[MARKETPLACE] Delist error:', error.message);
    next(error);
  }
});

/**
 * POST /api/marketplace/buy
 * Buy a listed token
 *
 * Body: { tokenId }
 */
router.post('/buy', async (req, res, next) => {
  try {
    const { tokenId } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        error: 'Missing tokenId',
        code: 'MISSING_FIELDS'
      });
    }

    // Check listing exists
    const listing = await blockchainService.getListing(tokenId);
    if (!listing.active) {
      return res.status(400).json({
        error: 'Token is not listed for sale',
        code: 'NOT_LISTED'
      });
    }

    const result = await blockchainService.buyToken(tokenId, req.wallet);

    console.log(`[MARKETPLACE] Token ${tokenId} bought by ${req.wallet} for ${result.price} wei`);

    res.json({
      success: true,
      tokenId: Number(tokenId),
      price: result.price,
      seller: result.seller,
      buyer: req.wallet,
      transactionHash: result.transactionHash
    });
  } catch (error) {
    console.error('[MARKETPLACE] Buy error:', error.message);
    next(error);
  }
});

module.exports = router;
