/**
 * License API routes
 *
 * Handles license document generation, storage on Arweave, and verification.
 */

const express = require('express');
const router = express.Router();

const licenseService = require('../services/license');
const arweaveService = require('../services/arweave');
const blockchainService = require('../services/blockchain');
const firestoreService = require('../services/firestore');
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

    // Get token data
    const tokenData = await firestoreService.getToken(tokenId);
    const blockchainData = await blockchainService.getTokenData(tokenId);

    // Create license document and upload to Arweave
    const result = await licenseService.createLicense({
      tokenId,
      tokenName: tokenData?.name || `NFTmarket #${tokenId}`,
      licenseType,
      creator: blockchainData.creator,
      seller: sellerAddress,
      buyer: 'TBD - Will be set at purchase', // Placeholder for listing
      imageHash: blockchainData.imageHash,
      salePrice: price,
      timestamp: Date.now()
    });

    // Store license info in Firestore for later retrieval
    await firestoreService.storeLicenseInfo(tokenId, {
      arweaveTxId: result.arweaveTxId,
      licenseHash: result.licenseHash,
      licenseType,
      licenseTypeName: result.licenseTypeName,
      seller: sellerAddress,
      price,
      preparedAt: new Date().toISOString(),
      status: 'prepared'
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
 * Finalize a license document after sale (update with buyer info)
 * Called after a successful purchase
 *
 * Body: { tokenId, buyer, transactionHash }
 */
router.post('/finalize', async (req, res, next) => {
  try {
    const { tokenId, buyer, transactionHash } = req.body;

    if (tokenId === undefined || !buyer) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, buyer'
      });
    }

    // Get the prepared license info
    const licenseInfo = await firestoreService.getLicenseInfo(tokenId);
    if (!licenseInfo || licenseInfo.status !== 'prepared') {
      return res.status(404).json({
        error: 'No prepared license found for this token'
      });
    }

    // Get token data for the final license
    const tokenData = await firestoreService.getToken(tokenId);
    const blockchainData = await blockchainService.getTokenData(tokenId);

    // Create the final license document with actual buyer
    const result = await licenseService.createLicense({
      tokenId,
      tokenName: tokenData?.name || `NFTmarket #${tokenId}`,
      licenseType: licenseInfo.licenseType,
      creator: blockchainData.creator,
      seller: licenseInfo.seller,
      buyer,
      imageHash: blockchainData.imageHash,
      salePrice: licenseInfo.price,
      timestamp: Date.now()
    });

    // Update license info in Firestore
    await firestoreService.storeLicenseInfo(tokenId, {
      ...licenseInfo,
      finalArweaveTxId: result.arweaveTxId,
      finalLicenseHash: result.licenseHash,
      buyer,
      transactionHash,
      finalizedAt: new Date().toISOString(),
      status: 'finalized'
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
 * Get license information for a token
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const { tokenId } = req.params;

    const licenseInfo = await firestoreService.getLicenseInfo(tokenId);
    if (!licenseInfo) {
      return res.status(404).json({
        error: 'No license found for this token'
      });
    }

    // Get the Arweave URL
    const txId = licenseInfo.finalArweaveTxId || licenseInfo.arweaveTxId;
    const arweaveUrl = arweaveService.getGatewayUrl(txId);

    res.json({
      tokenId: Number(tokenId),
      licenseType: licenseInfo.licenseType,
      licenseTypeName: licenseInfo.licenseTypeName,
      licenseHash: licenseInfo.finalLicenseHash || licenseInfo.licenseHash,
      arweaveTxId: txId,
      arweaveUrl,
      seller: licenseInfo.seller,
      buyer: licenseInfo.buyer,
      status: licenseInfo.status
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

    // Get license info from Firestore
    const licenseInfo = await firestoreService.getLicenseInfo(tokenId);
    if (!licenseInfo) {
      return res.status(404).json({
        error: 'No license found for this token'
      });
    }

    // Get on-chain license hash from the listing (if active)
    const listing = await blockchainService.getListing(tokenId);
    const onChainHash = listing.active ? listing.licenseHash : licenseInfo.licenseHash;

    // Verify the Arweave document matches the hash
    const txId = licenseInfo.finalArweaveTxId || licenseInfo.arweaveTxId;
    const verification = await licenseService.verifyLicense(txId, onChainHash);

    // Check Arweave confirmation status
    const arweaveStatus = await arweaveService.getStatus(txId);

    res.json({
      valid: verification.valid,
      tokenId: Number(tokenId),
      arweaveTxId: txId,
      arweaveConfirmed: arweaveStatus.confirmed,
      arweaveBlockHeight: arweaveStatus.blockHeight,
      onChainHash,
      licenseType: licenseInfo.licenseTypeName,
      error: verification.error || null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/license/:tokenId/document
 * Fetch the actual license document from Arweave
 */
router.get('/:tokenId/document', async (req, res, next) => {
  try {
    const { tokenId } = req.params;

    const licenseInfo = await firestoreService.getLicenseInfo(tokenId);
    if (!licenseInfo) {
      return res.status(404).json({
        error: 'No license found for this token'
      });
    }

    const txId = licenseInfo.finalArweaveTxId || licenseInfo.arweaveTxId;
    const data = await arweaveService.fetchData(txId);
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
