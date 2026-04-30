/**
 * EIP-712 Type Definitions — Single source of truth.
 *
 * Used by blockchain.js (service) and marketplace.js (route).
 * Matches the Solidity struct definitions in NFTmarketNFT.sol.
 */

const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' }
];

const LISTING_OFFER_TYPE = [
  { name: 'tokenId', type: 'uint256' },
  { name: 'price', type: 'uint256' },
  { name: 'licenseType', type: 'uint8' },
  { name: 'licenseHash', type: 'bytes32' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiry', type: 'uint256' }
];

const PURCHASE_ACCEPTANCE_TYPE = [
  { name: 'tokenId', type: 'uint256' },
  { name: 'price', type: 'uint256' },
  { name: 'licenseType', type: 'uint8' },
  { name: 'licenseHash', type: 'bytes32' },
  { name: 'seller', type: 'address' },
  { name: 'nonce', type: 'uint256' }
];

/**
 * Build complete EIP-712 typed data for a listing offer.
 * @param {Object} domain - EIP-712 domain from blockchainService.getEIP712Domain()
 * @param {Object} message - { tokenId, price, licenseType, licenseHash, nonce, expiry }
 * @returns {Object} Full typed data structure for signing
 */
function buildListingTypedData(domain, message) {
  return {
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      ListingOffer: LISTING_OFFER_TYPE,
    },
    primaryType: 'ListingOffer',
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    message,
  };
}

/**
 * Build complete EIP-712 typed data for a purchase acceptance.
 * @param {Object} domain - EIP-712 domain from blockchainService.getEIP712Domain()
 * @param {Object} message - { tokenId, price, licenseType, licenseHash, seller, nonce }
 * @returns {Object} Full typed data structure for signing
 */
function buildPurchaseTypedData(domain, message) {
  return {
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      PurchaseAcceptance: PURCHASE_ACCEPTANCE_TYPE,
    },
    primaryType: 'PurchaseAcceptance',
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    message,
  };
}

module.exports = {
  EIP712_DOMAIN_TYPE,
  LISTING_OFFER_TYPE,
  PURCHASE_ACCEPTANCE_TYPE,
  buildListingTypedData,
  buildPurchaseTypedData,
};
