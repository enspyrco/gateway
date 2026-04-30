/**
 * Gallery API routes
 * View NFTs owned by a wallet
 *
 * Data sources:
 * - Blockchain: token ownership, IPFS URI, license info, provenance
 * - IPFS: watermarked images (via gateway)
 * - Arweave: metadata (name, description) via tokenURI
 */

const express = require('express');
const router = express.Router();

const ipfsService = require('../services/ipfs');
const blockchainService = require('../services/blockchain');
const tokenRepository = require('../services/token-repository');
const { LICENSE_TYPE_NAMES, buildListingsArray, hasAnyListing } = require('../utils/license-utils');

/**
 * GET /api/gallery
 * Get list of wallets that have NFTs (for discovery)
 * Reads from blockchain - no Firestore needed
 */
router.get('/', async (req, res, next) => {
  try {
    // Get all tokens (cached via token-repository)
    const allTokens = await tokenRepository.getAllTokens();

    // Group by owner to build gallery list
    const ownerMap = new Map();
    for (const token of allTokens) {
      const owner = token.currentOwner.toLowerCase();
      if (!ownerMap.has(owner)) {
        ownerMap.set(owner, {
          address: token.currentOwner,
          tokenCount: 0,
          previewTokenName: null
        });
      }
      const gallery = ownerMap.get(owner);
      gallery.tokenCount++;
      if (!gallery.previewTokenName) {
        gallery.previewTokenName = `NFTmarket #${token.tokenId}`;
      }
    }

    const galleries = Array.from(ownerMap.values());
    res.json({ galleries });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gallery/:address
 * Get all tokens owned by a wallet address (public)
 * Reads from blockchain + IPFS - no Firestore needed
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

    // Get tokens owned by address (cached via token-repository)
    const ownedTokens = await tokenRepository.getTokensByOwner(address);

    // Build response from blockchain data, including multi-license listing info
    const tokens = await Promise.all(ownedTokens.map(async (token) => {
      // Use IPFS URI from blockchain for the image
      const imageUrl = token.ipfsUri
        ? ipfsService.getGatewayUrl(token.ipfsUri)
        : null;

      // Get all listings for this token (multi-license support)
      const allListings = await blockchainService.getAllListingsForToken(token.tokenId);
      const isListed = hasAnyListing(allListings);
      const listings = buildListingsArray(allListings, false); // false = no details (seller, nonce, etc.)

      return {
        tokenId: token.tokenId,
        name: `NFTmarket #${token.tokenId}`,
        imageUrl,
        ipfsUri: token.ipfsUri,
        metadataUri: token.uri, // Arweave URI for full metadata
        // License info from blockchain
        ownerLicense: LICENSE_TYPE_NAMES[token.ownerLicense] || 'unknown',
        creator: token.creator,
        copyrightOwner: token.copyrightOwner,
        mintedAt: token.mintedAt,
        // Provenance info
        isOriginal: token.isOriginal,
        parentToken: token.parentToken,
        originalToken: token.originalToken,
        // Multi-license listing info
        isListed,
        listings, // Array of {licenseType, price, priceEth}
        // Legacy single-listing fields (for backwards compatibility, use first listing)
        listingLicenseType: listings.length > 0 ? listings[0].licenseType : null,
        listingPrice: listings.length > 0 ? listings[0].price : null,
      };
    }));

    res.json({
      owner: address.toLowerCase(),
      tokens
    });
  } catch (error) {
    next(error);
  }
});

// Export router
module.exports = router;
