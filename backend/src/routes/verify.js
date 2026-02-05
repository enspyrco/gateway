/**
 * Verify API routes (public, no auth required)
 * GET /api/verify/:tokenId - Get public verification info
 *
 * Storage architecture:
 * - Token data from blockchain
 * - Metadata (name, description) from Arweave
 * - Image from IPFS
 */

const express = require('express');
const router = express.Router();

const blockchainService = require('../services/blockchain');
const arweaveService = require('../services/arweave');
const ipfsService = require('../services/ipfs');

/**
 * GET /api/verify/:tokenId
 * Public verification page data
 *
 * Returns:
 * - token info
 * - current owner
 * - creator
 * - watermarkId: format is "walletAddress:tokenId" (embedded in image)
 * - provenance (transfer history)
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const { tokenId } = req.params;

    // Get on-chain data
    let tokenData;
    try {
      tokenData = await blockchainService.getTokenData(tokenId);
    } catch (error) {
      return res.status(404).json({
        error: 'Token not found',
        code: 'TOKEN_NOT_FOUND'
      });
    }

    // Get metadata from Arweave (name, description)
    let metadata = null;
    if (tokenData.uri) {
      try {
        metadata = await arweaveService.fetchMetadata(tokenData.uri);
      } catch (e) {
        console.warn(`[Verify] Could not fetch Arweave metadata for token ${tokenId}`);
      }
    }

    // Get image URL from blockchain ipfsUri
    const imageUrl = tokenData.ipfsUri ? ipfsService.getGatewayUrl(tokenData.ipfsUri) : null;

    // Watermark ID format is "creatorAddress:tokenId"
    const watermarkId = `${tokenData.creator}:${tokenId}`;

    res.json({
      tokenId: Number(tokenId),
      name: metadata?.name || `NFTmarket #${tokenId}`,
      description: metadata?.description || '',
      imageUrl,
      previewUrl: imageUrl, // backwards compatibility
      creator: tokenData.creator,
      currentOwner: tokenData.currentOwner,
      copyrightOwner: tokenData.copyrightOwner,
      mintedAt: tokenData.mintedAt instanceof Date
        ? tokenData.mintedAt.toISOString()
        : tokenData.mintedAt,
      watermarkId,
      verified: true,
      contractAddress: process.env.NFTMARKET_CONTRACT_ADDRESS,
      chain: 'Polygon',
      explorerUrl: `https://polygonscan.com/token/${process.env.NFTMARKET_CONTRACT_ADDRESS}?a=${tokenId}`,
      // Provenance info
      isOriginal: tokenData.isOriginal,
      parentToken: tokenData.parentToken,
      originalToken: tokenData.originalToken,
      ownerLicense: ['display', 'commercial', 'transfer'][tokenData.ownerLicense] || 'unknown'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/verify/check/:imageHash
 * Check if an image hash is already registered
 */
router.get('/check/:imageHash', async (req, res, next) => {
  try {
    const { imageHash } = req.params;

    // Add 0x prefix if not present
    const hash = imageHash.startsWith('0x') ? imageHash : `0x${imageHash}`;

    const isRegistered = await blockchainService.isImageRegistered(hash);

    res.json({
      imageHash: hash,
      registered: isRegistered
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/verify/stats
 * Get platform statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const totalSupply = await blockchainService.totalSupply();

    res.json({
      totalTokens: totalSupply,
      chain: 'Polygon',
      contractAddress: process.env.NFTMARKET_CONTRACT_ADDRESS
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
