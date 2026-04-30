/**
 * Token Read Model — enriches blockchain token data with Arweave metadata and IPFS URLs.
 *
 * Eliminates the duplicated "fetch metadata, catch, fallback" pattern that appears
 * across marketplace.js, verify.js, and license.js routes.
 */

const arweaveService = require('../services/arweave');
const ipfsService = require('../services/ipfs');

/**
 * Enrich blockchain token data with Arweave metadata and IPFS image URL.
 *
 * @param {number|string} tokenId - Token identifier
 * @param {Object} blockchainData - Token data from blockchainService.getTokenData()
 * @returns {Promise<{ name: string, description: string, imageUrl: string|null, metadata: Object|null }>}
 */
async function enrichTokenData(tokenId, blockchainData) {
  let metadata = null;
  if (blockchainData?.uri) {
    try {
      metadata = await arweaveService.fetchMetadata(blockchainData.uri);
    } catch (e) {
      console.warn(`Could not fetch Arweave metadata for token ${tokenId}`);
    }
  }

  const imageUrl = blockchainData?.ipfsUri
    ? ipfsService.getGatewayUrl(blockchainData.ipfsUri)
    : null;

  return {
    name: metadata?.name || `NFTmarket #${tokenId}`,
    description: metadata?.description || '',
    imageUrl,
    metadata,
  };
}

module.exports = { enrichTokenData };
