/**
 * Marketplace API routes
 *
 * READ operations (GET) go through this API for metadata enrichment.
 * WRITE operations (list/buy/delist) must be done directly from the user's
 * wallet to the smart contract - but this API provides the EIP-712 typed
 * data needed for signing.
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const blockchainService = require('../services/blockchain');
const tokenRepository = require('../services/token-repository');
const authMiddleware = require('../middleware/auth');
const {
  LICENSE_TYPE_NAMES,
  parseLicenseType,
  getLicenseTypeName,
  buildListingsArray,
  hasAnyListing
} = require('../utils/license-utils');
const {
  encodeList,
  encodeBuy,
  encodeDelist,
  encodeDelistAll
} = require('../utils/abi-encoder');
const {
  buildListingTypedData,
  buildPurchaseTypedData,
} = require('../shared/eip712-types');
const { enrichTokenData } = require('../utils/token-read-model');

/**
 * Validate signature format (hex string, 65 bytes = 130 hex chars + 0x prefix)
 * @param {string} signature
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSignature(signature) {
  if (!signature || typeof signature !== 'string') {
    return { valid: false, error: 'Signature is required' };
  }
  if (!signature.startsWith('0x')) {
    return { valid: false, error: 'Signature must start with 0x' };
  }
  // 65 bytes = 130 hex chars + "0x" = 132 total
  if (signature.length !== 132) {
    return { valid: false, error: 'Invalid signature length (expected 65 bytes)' };
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return { valid: false, error: 'Signature contains invalid characters' };
  }
  return { valid: true };
}

/**
 * GET /api/marketplace
 * Get all active listings
 */
router.get('/', async (req, res, next) => {
  try {
    const listings = await tokenRepository.getActiveListings();

    // Enrich with data from blockchain + Arweave (metadata)
    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        try {
          // Get token data (cached via token-repository)
          const blockchainData = await tokenRepository.getTokenData(listing.tokenId);
          const enriched = await enrichTokenData(listing.tokenId, blockchainData);

          return {
            tokenId: listing.tokenId,
            name: enriched.name,
            description: enriched.description,
            imageUrl: enriched.imageUrl,
            ipfsUri: blockchainData?.ipfsUri,
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller,
            // License type being offered in this listing (from listing, not token)
            licenseType: LICENSE_TYPE_NAMES[listing.licenseType] || 'unknown',
            // Current owner's max license (what they could sell)
            ownerLicense: LICENSE_TYPE_NAMES[blockchainData?.ownerLicense] || 'unknown',
            creator: blockchainData?.creator,
            copyrightOwner: blockchainData?.copyrightOwner,
            nonce: listing.nonce,
            expiry: listing.expiry
          };
        } catch (e) {
          console.error(`[Marketplace] Error enriching listing ${listing.tokenId}:`, e.message);
          return {
            tokenId: listing.tokenId,
            name: `NFTmarket #${listing.tokenId}`,
            imageUrl: null,
            ipfsUri: null,
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller,
            licenseType: LICENSE_TYPE_NAMES[listing.licenseType] || 'unknown',
            nonce: listing.nonce,
            expiry: listing.expiry
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

/**
 * GET /api/marketplace/eip712/domain
 * Get the EIP-712 domain for signature verification
 * NOTE: Must be before /:tokenId route
 */
router.get('/eip712/domain', async (req, res, next) => {
  try {
    const domain = await blockchainService.getEIP712Domain();
    res.json({ domain });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/nonce/:address
 * Get the current nonce for an address (needed for EIP-712 signing)
 * NOTE: Must be before /:tokenId route
 */
router.get('/nonce/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    const nonce = await blockchainService.getNonce(address);
    res.json({ address, nonce });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/:tokenId
 * Get all listing details for a specific token (multi-license support)
 * NOTE: Must be AFTER specific routes like /eip712/domain and /nonce/:address
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const { tokenId } = req.params;

    // Get all listings for this token (multi-license support)
    const allListings = await blockchainService.getAllListingsForToken(tokenId);

    if (!hasAnyListing(allListings)) {
      return res.json({ listed: false, tokenId: Number(tokenId) });
    }

    // Get full token data (cached via token-repository)
    const blockchainData = await tokenRepository.getTokenData(tokenId);
    const enriched = await enrichTokenData(tokenId, blockchainData);

    // Build listings array with full details
    const listings = buildListingsArray(allListings, true); // true = include details

    res.json({
      listed: true,
      tokenId: Number(tokenId),
      name: enriched.name,
      description: enriched.description,
      imageUrl: enriched.imageUrl,
      ipfsUri: blockchainData?.ipfsUri,
      // Multi-license listings
      listings,
      // Token metadata from blockchain
      creator: blockchainData?.creator,
      copyrightOwner: blockchainData?.copyrightOwner,
      ownerLicense: LICENSE_TYPE_NAMES[blockchainData?.ownerLicense] || 'unknown',
      // Legacy single-listing fields (for backwards compatibility)
      seller: listings[0]?.seller,
      price: listings[0]?.price,
      priceEth: listings[0]?.priceEth,
      licenseType: listings[0]?.licenseType,
      nonce: listings[0]?.nonce,
      expiry: listings[0]?.expiry
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/list/typed-data
 * Get EIP-712 typed data for listing a token
 * Client signs this, then submits to the contract
 *
 * Body: { tokenId, price, licenseType, licenseHash, expiry? }
 */
router.post('/list/typed-data', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, price, licenseType, licenseHash, expiry } = req.body;
    const signerAddress = req.wallet;

    if (tokenId === undefined || !price || licenseType === undefined || !licenseHash) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, price, licenseType, licenseHash'
      });
    }

    // Verify ownership
    const isOwner = await blockchainService.isOwner(tokenId, signerAddress);
    if (!isOwner) {
      return res.status(403).json({
        error: 'You do not own this token',
        code: 'NOT_OWNER'
      });
    }

    const typedData = await blockchainService.getListingTypedData(
      tokenId,
      price,
      licenseType,
      licenseHash,
      expiry || 0,
      signerAddress
    );

    res.json({
      typedData,
      instructions: 'Sign this typed data with your wallet, then call the contract list() function with the signature'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/:tokenId/license-status
 * Check if the authenticated user already owns a license for this image
 * Used by frontend to show appropriate buy options (upgrade vs blocked)
 *
 * Returns: { existingLicense: string|null, canBuy: { display, commercial, transfer } }
 */
router.get('/:tokenId/license-status', authMiddleware, async (req, res, next) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    const buyerAddress = req.wallet;

    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid tokenId' });
    }

    // Get the original token ID for this listing
    const tokenData = await tokenRepository.getTokenData(tokenId);
    const originalTokenId = tokenData.isOriginal ? tokenId : tokenData.originalToken;

    // Check buyer's existing license level for this image (cached)
    const existingLevel = await tokenRepository.getBuyerExistingLicenseLevel(buyerAddress, originalTokenId);

    const existingLicense = existingLevel !== null ? getLicenseTypeName(existingLevel) : null;

    // Determine what the buyer can purchase (upgrades only)
    const canBuy = {
      display: existingLevel === null, // Can only buy display if no existing license
      commercial: existingLevel === null || existingLevel < 1, // Can buy if no license or only display
      transfer: existingLevel === null || existingLevel < 2 // Can buy if no license, display, or commercial
    };

    res.json({
      tokenId,
      originalTokenId,
      existingLicense,
      existingLevel,
      canBuy,
      message: existingLicense
        ? `You own a ${existingLicense} license for this image. You can only upgrade to a higher license type.`
        : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/buy/typed-data
 * Get EIP-712 typed data for buying a listed token
 * Client signs this, then submits to the contract with payment
 *
 * Body: { tokenId }
 */
router.post('/buy/typed-data', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId } = req.body;

    if (tokenId === undefined) {
      return res.status(400).json({ error: 'Missing required field: tokenId' });
    }

    const typedData = await blockchainService.getPurchaseTypedData(tokenId);

    res.json({
      typedData,
      instructions: 'Sign this typed data with your wallet, then call the contract buy() function with the signature and payment'
    });
  } catch (error) {
    if (error.message === 'Token not listed') {
      return res.status(404).json({ error: 'Token is not listed for sale' });
    }
    next(error);
  }
});

/**
 * POST /api/marketplace/list
 * Prepare a listing - backend handles all logic, returns data for client to sign and submit
 *
 * Body: { tokenId, priceEth, licenseType }
 * Returns: { typedData, contractCall } - client signs typedData, then submits contractCall
 */
router.post('/list', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, priceEth, licenseType } = req.body;
    const sellerAddress = req.wallet;

    // Validate inputs
    if (tokenId === undefined) {
      return res.status(400).json({ error: 'Missing tokenId', code: 'MISSING_TOKEN_ID' });
    }
    if (!priceEth || isNaN(parseFloat(priceEth))) {
      return res.status(400).json({ error: 'Invalid price', code: 'INVALID_PRICE' });
    }
    // Parse and validate license type
    const { valid, licenseTypeNum, error: licenseError } = parseLicenseType(licenseType);
    if (!valid) {
      return res.status(400).json({ error: licenseError, code: 'INVALID_LICENSE_TYPE' });
    }

    // Verify ownership
    const isOwner = await blockchainService.isOwner(tokenId, sellerAddress);
    if (!isOwner) {
      return res.status(403).json({ error: 'You do not own this token', code: 'NOT_OWNER' });
    }

    // Multi-license: check if THIS license type is already listed (other types can be listed)
    const existingListing = await blockchainService.getListing(tokenId, licenseTypeNum);
    if (existingListing.active) {
      return res.status(400).json({ error: 'Token is already listed for this license type', code: 'ALREADY_LISTED' });
    }

    // Convert price to wei
    const priceWei = BigInt(Math.floor(parseFloat(priceEth) * 1e18)).toString();

    // Generate license hash (hash of license terms)
    const licenseTerms = `NFTmarket License - Token ${tokenId} - Type ${licenseTypeNum} - Seller ${sellerAddress}`;
    const licenseHash = '0x' + crypto.createHash('sha256').update(licenseTerms).digest('hex');

    // Set expiry (0 = no expiry, or 7 days from now)
    const expiry = 0; // No expiry for now

    // Get nonce for the seller
    const nonce = await blockchainService.getNonce(sellerAddress);

    // Get EIP-712 domain
    const domain = await blockchainService.getEIP712Domain();

    // Build the typed data for signing
    const typedData = buildListingTypedData(domain, {
      tokenId: tokenId.toString(),
      price: priceWei,
      licenseType: licenseTypeNum,
      licenseHash: licenseHash,
      nonce: nonce.toString(),
      expiry: expiry.toString(),
    });

    // Build contract call parameters
    const contractCall = {
      method: 'list',
      params: {
        tokenId: tokenId,
        price: priceWei,
        licenseType: licenseTypeNum,
        licenseHash: licenseHash,
        expiry: expiry
        // signature will be added by client after signing
      }
    };

    res.json({
      success: true,
      typedData,
      contractCall,
      summary: {
        tokenId,
        priceEth,
        priceWei,
        licenseType: LICENSE_TYPE_NAMES[licenseTypeNum],
        seller: sellerAddress
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/delist
 * Prepare a delisting - backend handles validation, returns contract call info
 * Multi-license: specify which license type to delist, or use delistAll to remove all
 *
 * Body: { tokenId, licenseType } or { tokenId, all: true }
 * Returns: { contractCall } - client submits this to remove listing
 */
router.post('/delist', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, licenseType, all } = req.body;
    const sellerAddress = req.wallet;

    if (tokenId === undefined) {
      return res.status(400).json({ error: 'Missing tokenId', code: 'MISSING_TOKEN_ID' });
    }

    // Verify ownership
    const isOwner = await blockchainService.isOwner(tokenId, sellerAddress);
    if (!isOwner) {
      return res.status(403).json({ error: 'You do not own this token', code: 'NOT_OWNER' });
    }

    if (all) {
      // Delist all license types
      const allListings = await blockchainService.getAllListingsForToken(tokenId);
      const hasActiveListing = allListings.display.active || allListings.commercial.active || allListings.transfer.active;
      if (!hasActiveListing) {
        return res.status(400).json({ error: 'Token has no active listings', code: 'NOT_LISTED' });
      }

      const contractCall = {
        method: 'delistAll',
        params: { tokenId }
      };

      res.json({
        success: true,
        contractCall,
        summary: { tokenId, action: 'delistAll' }
      });
    } else {
      // Delist specific license type - parse and validate
      const { valid, licenseTypeNum, error: licenseError } = parseLicenseType(licenseType);
      if (!valid) {
        return res.status(400).json({ error: licenseError + ' (or set all: true)', code: 'INVALID_LICENSE_TYPE' });
      }

      // Check this specific license type is listed
      const listing = await blockchainService.getListing(tokenId, licenseTypeNum);
      if (!listing.active) {
        return res.status(400).json({ error: 'Token is not listed for this license type', code: 'NOT_LISTED' });
      }

      const contractCall = {
        method: 'delist',
        params: { tokenId, licenseType: licenseTypeNum }
      };

      res.json({
        success: true,
        contractCall,
        summary: { tokenId, licenseType: getLicenseTypeName(licenseTypeNum), action: 'delist' }
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/buy
 * Prepare a purchase - backend handles all logic, returns data for client to sign and submit
 * Multi-license: specify which license type listing to buy
 *
 * Body: { tokenId, licenseType }
 * Returns: { typedData, contractCall } - client signs typedData, then submits contractCall with payment
 */
router.post('/buy', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, licenseType } = req.body;
    const buyerAddress = req.wallet;

    if (tokenId === undefined) {
      return res.status(400).json({ error: 'Missing tokenId', code: 'MISSING_TOKEN_ID' });
    }

    // Parse and validate license type
    const { valid, licenseTypeNum, error: licenseError } = parseLicenseType(licenseType);
    if (!valid) {
      return res.status(400).json({ error: licenseError, code: 'INVALID_LICENSE_TYPE' });
    }

    // Get listing details for this specific license type
    const listing = await blockchainService.getListing(tokenId, licenseTypeNum);
    if (!listing.active) {
      return res.status(404).json({ error: 'Token is not listed for sale at this license type', code: 'NOT_LISTED' });
    }

    // Can't buy your own token
    if (listing.seller.toLowerCase() === buyerAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot buy your own token', code: 'CANNOT_BUY_OWN' });
    }

    // License upgrade validation: can upgrade (display→commercial→transfer), cannot downgrade
    // Get the original token ID for this listing
    const tokenData = await tokenRepository.getTokenData(tokenId);
    const originalTokenId = tokenData.isOriginal ? tokenId : tokenData.originalToken;

    // Check if buyer already owns a license for this image (cached)
    const existingLevel = await tokenRepository.getBuyerExistingLicenseLevel(buyerAddress, originalTokenId);
    if (existingLevel !== null) {
      if (licenseTypeNum <= existingLevel) {
        // Trying to buy same level or downgrade
        const existingName = getLicenseTypeName(existingLevel);
        const requestedName = getLicenseTypeName(licenseTypeNum);
        if (licenseTypeNum === existingLevel) {
          return res.status(400).json({
            error: `You already own a ${existingName} license for this image`,
            code: 'ALREADY_OWNED'
          });
        } else {
          return res.status(400).json({
            error: `Cannot downgrade: you already own a ${existingName} license (requested ${requestedName})`,
            code: 'CANNOT_DOWNGRADE'
          });
        }
      }
      // If licenseTypeNum > existingLevel, this is an upgrade - allowed
    }

    // Get EIP-712 domain
    const domain = await blockchainService.getEIP712Domain();

    // Use the listing's nonce (not buyer's nonce) - this is what the contract expects
    const nonce = listing.nonce;

    // Build the typed data for signing
    const typedData = buildPurchaseTypedData(domain, {
      tokenId: tokenId.toString(),
      price: listing.price,
      licenseType: licenseTypeNum,
      licenseHash: listing.licenseHash,
      seller: listing.seller,
      nonce: nonce.toString(),
    });

    // Build contract call parameters (includes licenseType for multi-license support)
    const contractCall = {
      method: 'buy',
      params: {
        tokenId: tokenId,
        licenseType: licenseTypeNum
        // signature will be added by client after signing
      },
      value: listing.price // ETH to send with transaction
    };

    const priceEth = (Number(listing.price) / 1e18).toFixed(4);

    res.json({
      success: true,
      typedData,
      contractCall,
      summary: {
        tokenId,
        priceEth,
        priceWei: listing.price,
        licenseType: LICENSE_TYPE_NAMES[licenseTypeNum],
        seller: listing.seller,
        buyer: buyerAddress
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============ ABI Encoding Endpoints ============
// These return pre-encoded transaction data so Flutter doesn't need to know about ABI

/**
 * POST /api/marketplace/list/encode
 * Encode a list() transaction after signing
 *
 * Body: { tokenId, price, licenseType, licenseHash, expiry, signature }
 * Returns: { txData } - ready to submit to blockchain
 */
router.post('/list/encode', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, price, licenseType, licenseHash, expiry, signature } = req.body;

    if (tokenId === undefined || !price || licenseType === undefined || !licenseHash || !signature) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, price, licenseType, licenseHash, signature',
        code: 'MISSING_FIELDS'
      });
    }

    // Validate signature format
    const sigValidation = validateSignature(signature);
    if (!sigValidation.valid) {
      return res.status(400).json({ error: sigValidation.error, code: 'INVALID_SIGNATURE' });
    }

    const txData = encodeList(tokenId, price, licenseType, licenseHash, expiry || 0, signature);

    res.json({
      success: true,
      txData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/buy/encode
 * Encode a buy() transaction after signing
 *
 * Body: { tokenId, licenseType, signature }
 * Returns: { txData, value } - ready to submit to blockchain
 */
router.post('/buy/encode', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, licenseType, signature } = req.body;

    if (tokenId === undefined || licenseType === undefined || !signature) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, licenseType, signature',
        code: 'MISSING_FIELDS'
      });
    }

    // Validate signature format
    const sigValidation = validateSignature(signature);
    if (!sigValidation.valid) {
      return res.status(400).json({ error: sigValidation.error, code: 'INVALID_SIGNATURE' });
    }

    // Parse license type
    const { valid, licenseTypeNum, error: licenseError } = parseLicenseType(licenseType);
    if (!valid) {
      return res.status(400).json({ error: licenseError, code: 'INVALID_LICENSE_TYPE' });
    }

    // Get listing to return the value (price) needed
    const listing = await blockchainService.getListing(tokenId, licenseTypeNum);
    if (!listing.active) {
      return res.status(404).json({ error: 'Token is not listed', code: 'NOT_LISTED' });
    }

    const txData = encodeBuy(tokenId, licenseTypeNum, signature);

    res.json({
      success: true,
      txData,
      value: listing.price // Wei to send with transaction
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/delist/encode
 * Encode a delist() or delistAll() transaction
 *
 * Body: { tokenId, licenseType } or { tokenId, all: true }
 * Returns: { txData } - ready to submit to blockchain
 */
router.post('/delist/encode', authMiddleware, async (req, res, next) => {
  try {
    const { tokenId, licenseType, all } = req.body;

    if (tokenId === undefined) {
      return res.status(400).json({ error: 'Missing tokenId', code: 'MISSING_TOKEN_ID' });
    }

    let txData;
    if (all) {
      txData = encodeDelistAll(tokenId);
    } else {
      const { valid, licenseTypeNum, error: licenseError } = parseLicenseType(licenseType);
      if (!valid) {
        return res.status(400).json({ error: licenseError, code: 'INVALID_LICENSE_TYPE' });
      }
      txData = encodeDelist(tokenId, licenseTypeNum);
    }

    res.json({
      success: true,
      txData
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
