/**
 * Marketplace API routes
 *
 * READ operations (GET) go through this API for metadata enrichment.
 * WRITE operations (list/buy/delist) must be done directly from the user's
 * wallet to the smart contract - but this API provides the EIP-712 typed
 * data needed for signing.
 */

const express = require('express');
const router = express.Router();

const blockchainService = require('../services/blockchain');
const ipfsService = require('../services/ipfs');
const arweaveService = require('../services/arweave');
const authMiddleware = require('../middleware/auth');

// License type names (matches contract enum)
const licenseTypeNames = ['display', 'commercial', 'transfer'];

/**
 * GET /api/marketplace
 * Get all active listings
 */
router.get('/', async (req, res, next) => {
  console.log('[DEBUG] GET /api/marketplace called');
  try {
    console.log('[DEBUG] Calling getActiveListings...');
    const listings = await blockchainService.getActiveListings();
    console.log('[DEBUG] Raw listings:', JSON.stringify(listings));

    // Enrich with data from blockchain + Arweave (metadata)
    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        try {
          // Get token data from blockchain (source of truth)
          const blockchainData = await blockchainService.getTokenData(listing.tokenId);

          // Fetch metadata from Arweave (name, description)
          let metadata = null;
          if (blockchainData?.uri) {
            try {
              metadata = await arweaveService.fetchMetadata(blockchainData.uri);
            } catch (e) {
              console.warn(`[Marketplace] Could not fetch Arweave metadata for token ${listing.tokenId}`);
            }
          }

          // Use IPFS URI from blockchain
          const imageUrl = blockchainData?.ipfsUri
            ? ipfsService.getGatewayUrl(blockchainData.ipfsUri)
            : null;

          return {
            tokenId: listing.tokenId,
            name: metadata?.name || `NFTmarket #${listing.tokenId}`,
            description: metadata?.description || '',
            imageUrl,
            ipfsUri: blockchainData?.ipfsUri,
            price: listing.price,
            priceEth: (Number(listing.price) / 1e18).toFixed(4),
            seller: listing.seller,
            // License type being offered in this listing (from listing, not token)
            licenseType: licenseTypeNames[listing.licenseType] || 'unknown',
            // Current owner's max license (what they could sell)
            ownerLicense: licenseTypeNames[blockchainData?.ownerLicense] || 'unknown',
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
            licenseType: licenseTypeNames[listing.licenseType] || 'unknown',
            nonce: listing.nonce,
            expiry: listing.expiry
          };
        }
      })
    );

    // Get contract info
    console.log('[DEBUG] Getting EIP712 domain...');
    const domain = await blockchainService.getEIP712Domain();
    console.log('[DEBUG] Domain:', domain);

    const response = {
      contract: {
        name: domain.name,
        address: domain.verifyingContract,
        chainId: domain.chainId
      },
      listings: enrichedListings
    };
    console.log('[DEBUG] Sending response with contract:', response.contract);
    res.json(response);
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

    const hasDisplayListing = allListings.display && allListings.display.active;
    const hasCommercialListing = allListings.commercial && allListings.commercial.active;
    const hasTransferListing = allListings.transfer && allListings.transfer.active;
    const isListed = hasDisplayListing || hasCommercialListing || hasTransferListing;

    if (!isListed) {
      return res.json({ listed: false, tokenId: Number(tokenId) });
    }

    // Get full token data from blockchain
    const blockchainData = await blockchainService.getTokenData(tokenId);

    // Fetch metadata from Arweave (name, description)
    let metadata = null;
    if (blockchainData?.uri) {
      try {
        metadata = await arweaveService.fetchMetadata(blockchainData.uri);
      } catch (e) {
        console.warn(`[Marketplace] Could not fetch Arweave metadata for token ${tokenId}`);
      }
    }

    // Image URL from blockchain IPFS URI
    const imageUrl = blockchainData?.ipfsUri
      ? ipfsService.getGatewayUrl(blockchainData.ipfsUri)
      : null;

    // Build listings array
    const listings = [];
    if (hasDisplayListing) {
      listings.push({
        licenseType: 'display',
        price: allListings.display.price,
        priceEth: (Number(allListings.display.price) / 1e18).toFixed(4),
        seller: allListings.display.seller,
        nonce: allListings.display.nonce,
        expiry: allListings.display.expiry,
        licenseHash: allListings.display.licenseHash
      });
    }
    if (hasCommercialListing) {
      listings.push({
        licenseType: 'commercial',
        price: allListings.commercial.price,
        priceEth: (Number(allListings.commercial.price) / 1e18).toFixed(4),
        seller: allListings.commercial.seller,
        nonce: allListings.commercial.nonce,
        expiry: allListings.commercial.expiry,
        licenseHash: allListings.commercial.licenseHash
      });
    }
    if (hasTransferListing) {
      listings.push({
        licenseType: 'transfer',
        price: allListings.transfer.price,
        priceEth: (Number(allListings.transfer.price) / 1e18).toFixed(4),
        seller: allListings.transfer.seller,
        nonce: allListings.transfer.nonce,
        expiry: allListings.transfer.expiry,
        licenseHash: allListings.transfer.licenseHash
      });
    }

    res.json({
      listed: true,
      tokenId: Number(tokenId),
      name: metadata?.name || `NFTmarket #${tokenId}`,
      description: metadata?.description || '',
      imageUrl,
      ipfsUri: blockchainData?.ipfsUri,
      // Multi-license listings
      listings,
      // Token metadata from blockchain
      creator: blockchainData?.creator,
      copyrightOwner: blockchainData?.copyrightOwner,
      ownerLicense: licenseTypeNames[blockchainData?.ownerLicense] || 'unknown',
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
    const signerAddress = req.walletAddress;

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
    if (licenseType === undefined) {
      return res.status(400).json({ error: 'Missing licenseType', code: 'MISSING_LICENSE_TYPE' });
    }

    // Convert license type string to number if needed
    const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
    const licenseTypeNum = typeof licenseType === 'string' ? licenseTypeMap[licenseType] : licenseType;
    if (licenseTypeNum === undefined || licenseTypeNum < 0 || licenseTypeNum > 2) {
      return res.status(400).json({ error: 'Invalid licenseType', code: 'INVALID_LICENSE_TYPE' });
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
    const crypto = require('crypto');
    const licenseTerms = `NFTmarket License - Token ${tokenId} - Type ${licenseTypeNum} - Seller ${sellerAddress}`;
    const licenseHash = '0x' + crypto.createHash('sha256').update(licenseTerms).digest('hex');

    // Set expiry (0 = no expiry, or 7 days from now)
    const expiry = 0; // No expiry for now

    // Get nonce for the seller
    const nonce = await blockchainService.getNonce(sellerAddress);

    // Get EIP-712 domain
    const domain = await blockchainService.getEIP712Domain();

    // Build the typed data for signing
    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        ListingOffer: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      },
      primaryType: 'ListingOffer',
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract
      },
      message: {
        tokenId: tokenId.toString(),
        price: priceWei,
        licenseType: licenseTypeNum,
        licenseHash: licenseHash,
        nonce: nonce.toString(),
        expiry: expiry.toString()
      }
    };

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
        licenseType: licenseTypeNames[licenseTypeNum],
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
      const hasAnyListing = allListings.display.active || allListings.commercial.active || allListings.transfer.active;
      if (!hasAnyListing) {
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
      // Delist specific license type
      if (licenseType === undefined) {
        return res.status(400).json({ error: 'Missing licenseType (or set all: true)', code: 'MISSING_LICENSE_TYPE' });
      }

      const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
      const licenseTypeNum = typeof licenseType === 'string' ? licenseTypeMap[licenseType] : licenseType;
      if (licenseTypeNum === undefined || licenseTypeNum < 0 || licenseTypeNum > 2) {
        return res.status(400).json({ error: 'Invalid licenseType', code: 'INVALID_LICENSE_TYPE' });
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

      const licenseTypeNames = ['display', 'commercial', 'transfer'];
      res.json({
        success: true,
        contractCall,
        summary: { tokenId, licenseType: licenseTypeNames[licenseTypeNum], action: 'delist' }
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

    if (licenseType === undefined) {
      return res.status(400).json({ error: 'Missing licenseType', code: 'MISSING_LICENSE_TYPE' });
    }

    // Convert license type string to number if needed
    const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
    const licenseTypeNum = typeof licenseType === 'string' ? licenseTypeMap[licenseType] : licenseType;
    if (licenseTypeNum === undefined || licenseTypeNum < 0 || licenseTypeNum > 2) {
      return res.status(400).json({ error: 'Invalid licenseType', code: 'INVALID_LICENSE_TYPE' });
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

    // Get EIP-712 domain
    const domain = await blockchainService.getEIP712Domain();

    // Use the listing's nonce (not buyer's nonce) - this is what the contract expects
    const nonce = listing.nonce;

    // Build the typed data for signing
    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        PurchaseAcceptance: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'licenseType', type: 'uint8' },
          { name: 'licenseHash', type: 'bytes32' },
          { name: 'seller', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      primaryType: 'PurchaseAcceptance',
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract
      },
      message: {
        tokenId: tokenId.toString(),
        price: listing.price,
        licenseType: licenseTypeNum,
        licenseHash: listing.licenseHash,
        seller: listing.seller,
        nonce: nonce.toString()
      }
    };

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
        licenseType: licenseTypeNames[licenseTypeNum],
        seller: listing.seller,
        buyer: buyerAddress
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
