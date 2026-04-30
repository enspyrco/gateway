/**
 * Blockchain Service Interface
 *
 * Defines the shared types and interface contract that both RealBlockchainService
 * and MockBlockchainService must implement.
 */

const { LISTING_OFFER_TYPE, PURCHASE_ACCEPTANCE_TYPE } = require('../../shared/eip712-types');

// License types (matches contract enum)
const LicenseType = {
  Display: 0,
  Commercial: 1,
  Transfer: 2
};

// Contract ABI (updated for V2 with authority system, no encryptedBlobUri)
const NFTMARKET_ABI = [
  // Authority management
  'function registerAuthority(address admin, uint96 feeBps) returns (uint256)',
  'function deactivateAuthority(uint256 authorityId)',
  'function updateAuthorityFee(uint256 authorityId, uint96 newFeeBps)',
  'function addMinter(uint256 authorityId, address minter)',
  'function removeMinter(uint256 authorityId, address minter)',
  'function getAuthority(uint256 authorityId) view returns (address admin, uint96 feeBps, bool isActive, uint256 registeredAt)',
  'function getMinterAuthority(address minter) view returns (uint256 authorityId, bool isMinter)',
  'function totalAuthorities() view returns (uint256)',
  'event AuthorityRegistered(uint256 indexed authorityId, address indexed admin, uint96 feeBps)',
  'event MinterAdded(uint256 indexed authorityId, address indexed minter)',
  'event MinterRemoved(uint256 indexed authorityId, address indexed minter)',
  // Token reservation and minting (no encryptedBlobUri)
  'function reserveTokenId() returns (uint256)',
  'function getReservation(uint256 tokenId) view returns (address reserver, uint256 expiry, bool isValid)',
  'function mint(uint256 reservedTokenId, address to, string uri, bytes32 imageHash, string ipfsUri) returns (uint256)',
  'event TokenReserved(uint256 indexed tokenId, address indexed reserver, uint256 expiry)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getTokenData(uint256 tokenId) view returns (address creator, address currentOwner, address copyrightOwner, uint8 ownerLicense, bytes32 imageHash, uint256 mintedAt, string ipfsUri, string uri, uint256 parentToken, uint256 originalToken, bool isOriginal, uint256 authorityId, address minter)',
  'function getProvenanceChain(uint256 tokenId) view returns (uint256[])',
  'function isImageRegistered(bytes32 imageHash) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'event Minted(uint256 indexed tokenId, address indexed creator, bytes32 imageHash, uint256 indexed authorityId, address minter)',
  // License rights view functions
  'function checkDisplayRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCommercialRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCopyrightOwnership(uint256 tokenId, address account) view returns (bool)',
  'function getMaxSellableLicense(uint256 tokenId) view returns (uint8)',
  'function hasDisplayLicense(uint256 tokenId, address account) view returns (bool)',
  // Marketplace functions (multi-license: can list same token at different prices per license type)
  'function list(uint256 tokenId, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 expiry, bytes signature)',
  'function delist(uint256 tokenId, uint8 licenseType)',
  'function delistAll(uint256 tokenId)',
  'function buy(uint256 tokenId, uint8 licenseType, bytes signature) payable',
  'function getListing(uint256 tokenId, uint8 licenseType) view returns (address seller, uint256 price, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function getAllListings(uint256 tokenId) view returns (uint256 displayPrice, bool displayActive, uint256 commercialPrice, bool commercialActive, uint256 transferPrice, bool transferActive)',
  'function getListingSignature(uint256 tokenId, uint8 licenseType) view returns (bytes)',
  'function getNonce(address account) view returns (uint256)',
  'function getDomainSeparator() view returns (bytes32)',
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry)',
  'event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 licenseType, bytes32 licenseHash)',
  'event BilateralAgreement(uint256 indexed tokenId, bytes sellerSignature, bytes buyerSignature, uint256 timestamp)',
  'event CopyrightTransferred(uint256 indexed tokenId, address indexed from, address indexed to)',
  'event DisplayRightsRetained(uint256 indexed tokenId, address indexed holder)',
  'event LicenseGranted(uint256 indexed newTokenId, uint256 indexed parentTokenId, uint256 indexed originalTokenId, address licensor, address licensee, uint8 licenseType, bytes32 licenseHash)',
  // Fee withdrawal (pull pattern)
  'function withdrawFees()',
  'function pendingFees(address minter) view returns (uint256)',
  'function MAX_FEE_BPS() view returns (uint256)',
  'event FeeAccrued(address indexed minter, uint256 indexed tokenId, uint256 amount)',
  'event FeeWithdrawn(address indexed minter, uint256 amount)'
];

// EIP-712 type definitions (single source of truth)
const EIP712_TYPES = {
  ListingOffer: LISTING_OFFER_TYPE,
  PurchaseAcceptance: PURCHASE_ACCEPTANCE_TYPE,
};

/**
 * @interface BlockchainService
 *
 * Both RealBlockchainService and MockBlockchainService implement this interface.
 * All methods return Promises. Methods that mutate state return [result, AppEvent[]].
 */

/**
 * Reserve the next token ID for watermarking.
 * Call BEFORE watermarking to guarantee the token ID matches.
 * @function reserveTokenId
 * @returns {Promise<[{tokenId: number, expiry: number, transactionHash: string}, AppEvent[]]>}
 */

/**
 * Mint a new NFT with a reserved token ID.
 * @function mint
 * @param {number} reservedTokenId - Token ID from reserveTokenId()
 * @param {string} to - Recipient wallet address
 * @param {string} uri - Token metadata URI (Arweave)
 * @param {string} imageHash - SHA-256 hash of watermarked image (0x prefixed)
 * @param {string} ipfsUri - IPFS URI of watermarked image (public)
 * @returns {Promise<[{tokenId: number, transactionHash: string, blockNumber: number}, AppEvent[]]>}
 */

/**
 * Check if a wallet owns a specific token.
 * @function isOwner
 * @param {number} tokenId
 * @param {string} walletAddress
 * @returns {Promise<boolean>}
 */

/**
 * Get token owner.
 * @function ownerOf
 * @param {number} tokenId
 * @returns {Promise<string>}
 */

/**
 * Get token URI.
 * @function tokenURI
 * @param {number} tokenId
 * @returns {Promise<string>}
 */

/**
 * Get token data.
 * @function getTokenData
 * @param {number} tokenId
 * @returns {Promise<Object>}
 */

/**
 * Get provenance chain for a token.
 * @function getProvenanceChain
 * @param {number} tokenId
 * @returns {Promise<number[]>}
 */

/**
 * Check if an address has Display rights for a token.
 * @function checkDisplayRights
 * @param {number} tokenId
 * @param {string} address
 * @returns {Promise<boolean>}
 */

/**
 * Check if an address has Commercial rights for a token.
 * @function checkCommercialRights
 * @param {number} tokenId
 * @param {string} address
 * @returns {Promise<boolean>}
 */

/**
 * Check if an address owns the copyright for a token.
 * @function checkCopyrightOwnership
 * @param {number} tokenId
 * @param {string} address
 * @returns {Promise<boolean>}
 */

/**
 * Get the maximum license type the current owner can sell.
 * @function getMaxSellableLicense
 * @param {number} tokenId
 * @returns {Promise<number>}
 */

/**
 * Check if an image hash is already registered.
 * @function isImageRegistered
 * @param {string} imageHash
 * @returns {Promise<boolean>}
 */

/**
 * Get total supply.
 * @function totalSupply
 * @returns {Promise<number>}
 */

/**
 * Get the EIP-712 domain for signing.
 * @function getEIP712Domain
 * @returns {Promise<Object>}
 */

/**
 * Get the current nonce for an address.
 * @function getNonce
 * @param {string} address
 * @returns {Promise<number>}
 */

/**
 * Get typed data for listing (seller signature).
 * @function getListingTypedData
 * @param {number} tokenId
 * @param {string} price
 * @param {number} licenseType
 * @param {string} licenseHash
 * @param {number} expiry
 * @param {string} signerAddress
 * @returns {Promise<Object>}
 */

/**
 * Get typed data for purchase (buyer signature).
 * @function getPurchaseTypedData
 * @param {number} tokenId
 * @param {number} licenseType
 * @returns {Promise<Object>}
 */

/**
 * List a token for sale (mock only — real listing done client-side).
 * @function listToken
 * @param {number} tokenId
 * @param {string} price
 * @param {number} licenseType
 * @param {string} licenseHash
 * @param {number} expiry
 * @param {string} signature
 * @param {string} sellerAddress
 * @returns {Promise<[Object, AppEvent[]]>}
 */

/**
 * Delist a specific license type listing.
 * @function delistToken
 * @param {number} tokenId
 * @param {number} licenseType
 * @param {string} sellerAddress
 * @returns {Promise<[Object, AppEvent[]]>}
 */

/**
 * Delist all license types for a token.
 * @function delistAllToken
 * @param {number} tokenId
 * @param {string} sellerAddress
 * @returns {Promise<[Object, AppEvent[]]>}
 */

/**
 * Buy a listed token (mock only — real buying done client-side).
 * @function buyToken
 * @param {number} tokenId
 * @param {number} licenseType
 * @param {string} signature
 * @param {string} buyerAddress
 * @returns {Promise<[Object, AppEvent[]]>}
 */

/**
 * Get listing info for a specific license type.
 * @function getListing
 * @param {number} tokenId
 * @param {number} licenseType
 * @returns {Promise<Object>}
 */

/**
 * Get all listings for a token (all license types).
 * @function getAllListingsForToken
 * @param {number} tokenId
 * @returns {Promise<{display: Object, commercial: Object, transfer: Object}>}
 */

/**
 * Get all active listings.
 * @function getActiveListings
 * @returns {Promise<Object[]>}
 */

/**
 * Start listening for blockchain events.
 * @function startEventListener
 * @param {Object} callbacks
 * @returns {Function} Cleanup function to stop listening
 */

/**
 * Get all tokens from the blockchain.
 * @function getAllTokens
 * @returns {Promise<Object[]>}
 */

/**
 * Get the highest license level a buyer already owns for a given original image.
 * @function getBuyerExistingLicenseLevel
 * @param {string} buyerAddress
 * @param {number} originalTokenId
 * @returns {Promise<number|null>}
 */

module.exports = {
  LicenseType,
  NFTMARKET_ABI,
  EIP712_TYPES,
};
