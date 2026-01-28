/**
 * Gallery API routes
 * View NFTs owned by a wallet
 */

const express = require('express');
const router = express.Router();

const firestoreService = require('../services/firestore');
const ipfsService = require('../services/ipfs');

const LICENSE_NAMES = ['display', 'commercial', 'transfer'];
const VALID_LICENSE_TYPES = new Set(LICENSE_NAMES);

/**
 * GET /api/gallery
 * Get list of wallets that have NFTs (for discovery)
 */
router.get('/', async (req, res, next) => {
  try {
    const galleries = await firestoreService.getGalleryList(20);
    res.json({ galleries });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gallery/:address
 * Get all tokens owned by a wallet address (public)
 */
router.get('/:address', async (req, res, next) => {
  try {
    const { address } = req.params;

    // Validate address format (basic check)
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: 'Invalid wallet address',
        code: 'INVALID_ADDRESS'
      });
    }

    const tokens = await firestoreService.getTokensByOwner(address, 100);

    // Enrich with preview URLs
    const enrichedTokens = tokens.map((token) => {
      const previewUrl = token.previewUri
        ? ipfsService.getGatewayUrl(token.previewUri)
        : null;

      return {
        tokenId: token.tokenId,
        name: token.name || `NFTmarket #${token.tokenId}`,
        description: token.description || '',
        previewUrl,
        licenseType: VALID_LICENSE_TYPES.has(token.licenseType)
          ? token.licenseType
          : (LICENSE_NAMES[token.licenseType] || 'unknown'),
        creator: token.wallet,
        mintedAt: token.createdAt,
      };
    });

    res.json({
      owner: address.toLowerCase(),
      tokens: enrichedTokens
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
