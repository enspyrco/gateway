/**
 * License API routes
 *
 * Handles license document generation and verification.
 *
 * Storage architecture:
 * - License documents are stored on Arweave (permanent)
 * - License hash is stored on-chain in listing
 * - Token metadata on Arweave has license info
 */

const express = require('express');
const router = express.Router();

const licenseService = require('../services/license');
const arweaveService = require('../services/arweave');
const blockchainService = require('../services/blockchain');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/license/prepare
 * Prepare a license document for a listing (before sale)
 * Returns the license hash that will be used in the listing signature
 *
 * Body: { tokenId, licenseType, price }
 */
router.post('/prepare', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, licenseType, price } = req.body;
    const sellerAddress = req.walletAddress;

    if (tokenId === undefined || licenseType === undefined || !price) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, licenseType, price'
      });
    }

    // Verify ownership
    const isOwner = await blockchainService.isOwner(tokenId, sellerAddress);
    if (!isOwner) {
      return res.status(403).json({
        error: 'You do not own this token',
        code: 'NOT_OWNER'
      });
    }

    // Check license rights - can't sell more than you have
    const maxLicense = await blockchainService.getMaxSellableLicense(tokenId);
    if (licenseType > maxLicense) {
      return res.status(403).json({
        error: `Cannot sell ${licenseService.getLicenseTypeName(licenseType)} license. Maximum sellable: ${licenseService.getLicenseTypeName(maxLicense)}`,
        code: 'CANNOT_ESCALATE_RIGHTS'
      });
    }

    // Get token data from blockchain
    const blockchainData = await blockchainService.getTokenData(tokenId);

    // Get metadata from Arweave (for token name)
    let metadata = null;
    if (blockchainData?.uri) {
      try {
        metadata = await arweaveService.fetchMetadata(blockchainData.uri);
      } catch (e) {
        console.warn(`[License] Could not fetch Arweave metadata for token ${tokenId}`);
      }
    }

    // Create license document and upload to Arweave
    const result = await licenseService.createLicense({
      tokenId,
      tokenName: metadata?.name || `NFTmarket #${tokenId}`,
      licenseType,
      creator: blockchainData.creator,
      seller: sellerAddress,
      buyer: 'TBD - Will be set at purchase', // Placeholder for listing
      imageHash: blockchainData.imageHash,
      salePrice: price,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      licenseHash: result.licenseHash,
      arweaveTxId: result.arweaveTxId,
      arweaveUrl: result.arweaveUrl,
      licenseType,
      licenseTypeName: result.licenseTypeName,
      instructions: 'Use this licenseHash when signing the listing offer'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/license/finalize
 * Finalize a license document after sale (create final version with buyer info)
 * Called after a successful purchase
 *
 * Body: { tokenId, buyer, transactionHash, licenseType }
 */
router.post('/finalize', async (req, res, next) => {
  try {
    const { tokenId, buyer, transactionHash, licenseType } = req.body;

    if (tokenId === undefined || !buyer || licenseType === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, buyer, licenseType'
      });
    }

    // Get token data from blockchain
    const blockchainData = await blockchainService.getTokenData(tokenId);

    // Get metadata from Arweave (for token name)
    let metadata = null;
    if (blockchainData?.uri) {
      try {
        metadata = await arweaveService.fetchMetadata(blockchainData.uri);
      } catch (e) {
        console.warn(`[License] Could not fetch Arweave metadata for token ${tokenId}`);
      }
    }

    // Create the final license document with actual buyer
    const result = await licenseService.createLicense({
      tokenId,
      tokenName: metadata?.name || `NFTmarket #${tokenId}`,
      licenseType,
      creator: blockchainData.creator,
      seller: blockchainData.copyrightOwner, // Previous copyright owner
      buyer,
      imageHash: blockchainData.imageHash,
      transactionHash,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      arweaveTxId: result.arweaveTxId,
      arweaveUrl: result.arweaveUrl,
      licenseHash: result.licenseHash,
      licenseTypeName: result.licenseTypeName
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/license/:tokenId
 * Get license information for a token from blockchain + Arweave
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const { tokenId } = req.params;

    // Get token data from blockchain (has license type)
    const blockchainData = await blockchainService.getTokenData(tokenId);
    if (!blockchainData) {
      return res.status(404).json({
        error: 'Token not found'
      });
    }

    // Get listing if active (has license hash)
    const listing = await blockchainService.getListing(tokenId);

    // License type names
    const licenseTypeNames = ['Display', 'Commercial', 'Transfer'];

    res.json({
      tokenId: Number(tokenId),
      ownerLicense: blockchainData.ownerLicense,
      ownerLicenseName: licenseTypeNames[blockchainData.ownerLicense] || 'Unknown',
      creator: blockchainData.creator,
      copyrightOwner: blockchainData.copyrightOwner,
      listing: listing.active ? {
        licenseType: listing.licenseType,
        licenseTypeName: licenseTypeNames[listing.licenseType] || 'Unknown',
        licenseHash: listing.licenseHash,
        price: listing.price,
        priceEth: (Number(listing.price) / 1e18).toFixed(4),
        seller: listing.seller
      } : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/license/:tokenId/verify
 * Verify a license document against its on-chain hash
 */
router.get('/:tokenId/verify', async (req, res, next) => {
  try {
    const { tokenId } = req.params;
    const { arweaveTxId } = req.query;

    if (!arweaveTxId) {
      return res.status(400).json({
        error: 'arweaveTxId query parameter required'
      });
    }

    // Get on-chain license hash from listing
    const listing = await blockchainService.getListing(tokenId);
    if (!listing.active) {
      return res.status(404).json({
        error: 'Token is not currently listed'
      });
    }

    // Verify the Arweave document matches the hash
    const verification = await licenseService.verifyLicense(arweaveTxId, listing.licenseHash);

    // Check Arweave confirmation status
    const arweaveStatus = await arweaveService.getStatus(arweaveTxId);

    res.json({
      valid: verification.valid,
      tokenId: Number(tokenId),
      arweaveTxId,
      arweaveConfirmed: arweaveStatus.confirmed,
      arweaveBlockHeight: arweaveStatus.blockHeight,
      onChainHash: listing.licenseHash,
      error: verification.error || null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/license/:tokenId/document
 * Fetch a license document from Arweave
 */
router.get('/:tokenId/document', async (req, res, next) => {
  try {
    const { arweaveTxId } = req.query;

    if (!arweaveTxId) {
      return res.status(400).json({
        error: 'arweaveTxId query parameter required'
      });
    }

    const data = await arweaveService.fetchData(arweaveTxId);
    const license = JSON.parse(data.toString());

    res.json(license);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/license/types
 * Get available license types and their descriptions
 */
router.get('/types', async (req, res) => {
  res.json({
    types: [
      {
        id: 0,
        name: 'Display',
        code: 'CBE-PERSONAL',
        description: 'Personal, non-commercial display only',
        rights: ['Display artwork', 'Share on social media', 'Transfer NFT'],
        restrictions: ['No commercial use', 'No derivatives', 'No sublicensing']
      },
      {
        id: 1,
        name: 'Commercial',
        code: 'CBE-COMMERCIAL',
        description: 'Commercial use rights, creator retains copyright',
        rights: ['All Display rights', 'Commercial use', 'Create derivatives', 'Merchandise'],
        restrictions: ['No sublicensing', 'No trademark registration', 'Creator retains copyright']
      },
      {
        id: 2,
        name: 'Transfer',
        code: 'CBE-EXCLUSIVE',
        description: 'Full copyright transfer to buyer',
        rights: ['Full copyright ownership', 'All commercial rights', 'Sublicensing', 'Trademark registration'],
        restrictions: ['Seller retains personal display rights', 'Creator retains moral rights']
      }
    ]
  });
});

module.exports = router;
