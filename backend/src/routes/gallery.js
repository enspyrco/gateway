/**
 * Gallery API routes
 * View NFTs owned by a wallet
 */

const express = require('express');
const router = express.Router();

const firestoreService = require('../services/firestore');
const ipfsService = require('../services/ipfs');
const blockchainService = require('../services/blockchain');

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

/**
 * POST /api/gallery/sync
 * Sync Firestore with blockchain state (development only)
 * Reads all tokens from blockchain and populates Firestore
 */
router.post('/sync', async (req, res, next) => {
  try {
    console.log('[Gallery] Starting blockchain sync...');

    const tokens = await blockchainService.getAllTokens();
    console.log(`[Gallery] Found ${tokens.length} tokens on blockchain`);

    let synced = 0;
    let updated = 0;
    for (const token of tokens) {
      // Check if already in Firestore
      const existing = await firestoreService.getToken(token.tokenId);
      if (!existing) {
        // Create token record from blockchain data
        await firestoreService.createToken({
          tokenId: token.tokenId,
          mintId: `sync_${token.tokenId}`,
          wallet: token.creator,
          name: `NFTmarket #${token.tokenId}`,
          description: '',
          imageHash: token.imageHash,
          watermarkId: null,
          keyId: null,
          storagePath: null,
          previewUri: null,
          metadataUri: token.uri,
          transactionHash: null,
          createdAt: token.mintedAt || new Date(),
        });

        // Update owner if different from creator
        if (token.currentOwner.toLowerCase() !== token.creator.toLowerCase()) {
          await firestoreService.updateTokenOwner(token.tokenId, token.currentOwner);
        }

        synced++;
        console.log(`[Gallery] Synced token ${token.tokenId}`);
      } else {
        // Update ownership if changed on-chain
        const firestoreOwner = (existing.currentOwner || existing.wallet || '').toLowerCase();
        const blockchainOwner = token.currentOwner.toLowerCase();
        console.log(`[Gallery] Token ${token.tokenId}: Firestore=${firestoreOwner}, Blockchain=${blockchainOwner}`);
        if (firestoreOwner !== blockchainOwner) {
          await firestoreService.updateTokenOwner(token.tokenId, token.currentOwner);
          updated++;
          console.log(`[Gallery] Updated owner for token ${token.tokenId}: ${firestoreOwner} -> ${blockchainOwner}`);
        }
      }
    }

    res.json({
      success: true,
      message: `Synced ${synced} new tokens, updated ${updated} owners`,
      totalOnChain: tokens.length,
      newlySynced: synced,
      ownersUpdated: updated
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
