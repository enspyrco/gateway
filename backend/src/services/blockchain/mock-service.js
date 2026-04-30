/**
 * Mock Blockchain Service
 * In-memory implementation of the blockchain service for testing.
 * No real Ethers.js calls — all state is stored in Maps.
 */

const crypto = require('crypto');
const E = require('../../events/types');
const persistence = require('../mock-persistence');
const { LicenseType, EIP712_TYPES } = require('./interface');

// Mock contract address for EIP-712 domain
const CONTRACT_ADDRESS = process.env.NFTMARKET_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// ── Mock state ────────────────────────────────────────────────────────────────

const mockTokens = persistence.loadMap('blockchain-tokens');
let mockTokenCounter = persistence.loadValue('blockchain-counter', 0);

// Multi-license: mockListings is Map<tokenId, Map<licenseType, Listing>>
// Note: persistence stores the inner Maps as plain objects; we reconstruct below.
const _rawListings = persistence.loadMap('blockchain-listings');
const mockListings = new Map();
for (const [tokenId, inner] of _rawListings) {
  if (inner instanceof Map) {
    mockListings.set(tokenId, inner);
  } else if (inner && typeof inner === 'object') {
    // Reconstruct Map from plain object (as loaded from JSON)
    const innerMap = new Map();
    for (const [lt, listing] of Object.entries(inner)) {
      innerMap.set(Number(lt), listing);
    }
    mockListings.set(tokenId, innerMap);
  }
}

const mockNonces = persistence.loadMap('blockchain-nonces');

// Track display rights retained from Transfer sales (tokenId => Set of addresses)
// Sets are not JSON-serializable, so we persist as Arrays and reconstruct.
const _rawDisplayRights = persistence.loadMap('blockchain-displayrights');
const mockDisplayRights = new Map();
for (const [tokenId, value] of _rawDisplayRights) {
  if (value instanceof Set) {
    mockDisplayRights.set(tokenId, value);
  } else if (Array.isArray(value)) {
    mockDisplayRights.set(tokenId, new Set(value));
  } else {
    mockDisplayRights.set(tokenId, new Set());
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────

// Helper to get or create listing map for a token
function getTokenListings(tokenId) {
  const id = Number(tokenId);
  if (!mockListings.has(id)) {
    mockListings.set(id, new Map());
  }
  return mockListings.get(id);
}

// Save all mock blockchain state
function saveMockState() {
  persistence.saveMap('blockchain-tokens', mockTokens);
  persistence.saveValue('blockchain-counter', mockTokenCounter);

  // Flatten inner Maps to plain objects for JSON serialisation
  const flatListings = new Map();
  for (const [tokenId, innerMap] of mockListings) {
    const obj = {};
    for (const [lt, listing] of innerMap) {
      obj[lt] = listing;
    }
    flatListings.set(tokenId, obj);
  }
  persistence.saveMap('blockchain-listings', flatListings);

  persistence.saveMap('blockchain-nonces', mockNonces);

  // Convert Sets to Arrays for JSON serialisation
  const flatDisplayRights = new Map();
  for (const [tokenId, set] of mockDisplayRights) {
    flatDisplayRights.set(tokenId, Array.from(set));
  }
  persistence.saveMap('blockchain-displayrights', flatDisplayRights);
}

// ── EIP-712 helpers ───────────────────────────────────────────────────────────

/**
 * Get the EIP-712 domain for signing (mock uses Hardhat chain ID)
 */
async function getEIP712Domain() {
  return {
    name: 'NFTmarket',
    version: '1',
    chainId: 31337, // Hardhat
    verifyingContract: CONTRACT_ADDRESS
  };
}

/**
 * Get the current nonce for an address
 */
async function getNonce(address) {
  return mockNonces.get(address.toLowerCase()) || 0;
}

/**
 * Get typed data for listing (seller signature)
 */
async function getListingTypedData(tokenId, price, licenseType, licenseHash, expiry, signerAddress) {
  const domain = await getEIP712Domain();
  const nonce = await getNonce(signerAddress);

  const value = {
    tokenId: BigInt(tokenId),
    price: BigInt(price),
    licenseType: licenseType,
    licenseHash: licenseHash,
    nonce: BigInt(nonce),
    expiry: BigInt(expiry || 0)
  };

  return {
    domain,
    types: { ListingOffer: EIP712_TYPES.ListingOffer },
    primaryType: 'ListingOffer',
    message: value,
    raw: {
      tokenId: tokenId.toString(),
      price: price.toString(),
      licenseType,
      licenseHash,
      nonce: nonce.toString(),
      expiry: (expiry || 0).toString()
    }
  };
}

/**
 * Get typed data for purchase (buyer signature)
 */
async function getPurchaseTypedData(tokenId, licenseType) {
  const tokenListings = getTokenListings(tokenId);
  const listing = tokenListings.get(Number(licenseType));
  if (!listing || !listing.active) {
    throw new Error('Token not listed for this license type');
  }

  const domain = await getEIP712Domain();

  const value = {
    tokenId: BigInt(tokenId),
    price: BigInt(listing.price),
    licenseType: listing.licenseType,
    licenseHash: listing.licenseHash,
    seller: listing.seller,
    nonce: BigInt(listing.nonce)
  };

  return {
    domain,
    types: { PurchaseAcceptance: EIP712_TYPES.PurchaseAcceptance },
    primaryType: 'PurchaseAcceptance',
    message: value,
    raw: {
      tokenId: tokenId.toString(),
      price: listing.price.toString(),
      licenseType: listing.licenseType,
      licenseHash: listing.licenseHash,
      seller: listing.seller,
      nonce: listing.nonce.toString()
    }
  };
}

// ── Token lifecycle ───────────────────────────────────────────────────────────

/**
 * Reserve the next token ID for watermarking
 */
async function reserveTokenId() {
  const tokenId = mockTokenCounter++;
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  mockTokens.set(tokenId, {
    reserved: true,
    reserver: 'mock-minter',
    expiry
  });
  saveMockState();

  const transactionHash = '0x' + crypto.randomBytes(32).toString('hex');
  const result = { tokenId, expiry, transactionHash };
  const events = [E.tokenReserved({ tokenId, expiry, transactionHash, mock: true })];

  return [result, events];
}

/**
 * Mint a new NFT with a reserved token ID.
 * Creator always receives Transfer (full) rights — matches on-chain behaviour.
 *
 * @param {number} reservedTokenId - Token ID from reserveTokenId()
 * @param {string} to - Recipient wallet address
 * @param {string} uri - Token metadata URI (Arweave)
 * @param {string} imageHash - SHA-256 hash of watermarked image (0x prefixed)
 * @param {string} ipfsUri - IPFS URI of watermarked image (public)
 */
async function mint(reservedTokenId, to, uri, imageHash, ipfsUri) {
  // Verify reservation exists
  const reservation = mockTokens.get(reservedTokenId);
  if (!reservation || !reservation.reserved) {
    throw new Error('No valid reservation for token ID');
  }
  if (reservation.expiry < Math.floor(Date.now() / 1000)) {
    mockTokens.delete(reservedTokenId);
    saveMockState();
    throw new Error('Reservation expired');
  }

  // Check for duplicate image hash
  for (const token of mockTokens.values()) {
    if (token.imageHash === imageHash && !token.reserved) {
      throw new Error('Image already registered');
    }
  }

  const tokenId = reservedTokenId;
  const transactionHash = '0x' + crypto.randomBytes(32).toString('hex');
  const blockNumber = 10000000 + tokenId;

  // Replace reservation with actual token data.
  // Only ownerLicense is stored — no redundant licenseType field.
  mockTokens.set(tokenId, {
    creator: to,
    currentOwner: to,
    copyrightOwner: to,
    ownerLicense: LicenseType.Transfer,
    licenseHash: null,
    imageHash,
    mintedAt: new Date(),
    ipfsUri,
    uri,
    parentToken: 0,
    originalToken: tokenId,
    isOriginal: true,
    authorityId: 0,
    minter: 'mock-minter'
  });
  saveMockState();

  const result = { tokenId, transactionHash, blockNumber };
  const events = [E.tokenMinted({
    tokenId, to, transactionHash, blockNumber,
    imageHash, ipfsUri, uri, licenseType: LicenseType.Transfer, mock: true
  })];

  return [result, events];
}

/**
 * Check if a wallet owns a specific token
 */
async function isOwner(tokenId, walletAddress) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) return false;
  return token.currentOwner.toLowerCase() === walletAddress.toLowerCase();
}

/**
 * Get token owner
 */
async function ownerOf(tokenId) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) {
    throw new Error('Token does not exist');
  }
  return token.currentOwner;
}

/**
 * Get token URI
 */
async function tokenURI(tokenId) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) {
    throw new Error('Token does not exist');
  }
  return token.uri;
}

/**
 * Get token data
 */
async function getTokenData(tokenId) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) {
    throw new Error('Token does not exist');
  }
  return { ...token };
}

/**
 * Get provenance chain for a token
 */
async function getProvenanceChain(tokenId) {
  const chain = [];
  let current = Number(tokenId);
  while (true) {
    chain.push(current);
    const token = mockTokens.get(current);
    if (!token || token.isOriginal || token.parentToken === current) {
      break;
    }
    current = token.parentToken;
    if (chain.length > 1000) break; // Safety limit
  }
  return chain;
}

/**
 * Check if an address has Display rights for a token
 */
async function checkDisplayRights(tokenId, address) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) return false;

  // Creator always has display rights
  if (token.creator.toLowerCase() === address.toLowerCase()) return true;

  // Current owner always has display rights
  if (token.currentOwner.toLowerCase() === address.toLowerCase()) return true;

  // Check retained display rights from Transfer sales
  const rights = mockDisplayRights.get(Number(tokenId));
  if (rights && rights.has(address.toLowerCase())) return true;

  return false;
}

/**
 * Check if an address has Commercial rights for a token
 */
async function checkCommercialRights(tokenId, address) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) return false;

  // Copyright owner has commercial rights
  if (token.copyrightOwner.toLowerCase() === address.toLowerCase()) return true;

  // Current owner has commercial rights if license is Commercial or Transfer
  if (token.currentOwner.toLowerCase() === address.toLowerCase()) {
    return token.ownerLicense >= LicenseType.Commercial;
  }

  return false;
}

/**
 * Check if an address owns the copyright for a token
 */
async function checkCopyrightOwnership(tokenId, address) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) return false;
  return token.copyrightOwner.toLowerCase() === address.toLowerCase();
}

/**
 * Get the maximum license type the current owner can sell
 */
async function getMaxSellableLicense(tokenId) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) throw new Error('Token does not exist');
  return token.ownerLicense;
}

/**
 * Check if an image hash is already registered
 */
async function isImageRegistered(imageHash) {
  for (const token of mockTokens.values()) {
    if (token.imageHash === imageHash) {
      return true;
    }
  }
  return false;
}

/**
 * Get total supply
 */
async function totalSupply() {
  return mockTokens.size;
}

// ── Marketplace ───────────────────────────────────────────────────────────────

/**
 * List a token for sale.
 * Multi-license: allows listing same token at different prices for Display, Commercial, Transfer.
 *
 * @param {number} tokenId
 * @param {string} price - Price in wei
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {string} licenseHash - SHA-256 hash of license document (0x prefixed)
 * @param {number} expiry - Expiration timestamp (0 for no expiry)
 * @param {string} signature - Seller's EIP-712 signature
 * @param {string} sellerAddress - Address of the seller
 */
async function listToken(tokenId, price, licenseType, licenseHash, expiry, signature, sellerAddress) {
  // Convert string license type to number if needed
  const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
  const actualLicenseType = typeof licenseType === 'string' ? licenseTypeMap[licenseType] : licenseType;

  const token = mockTokens.get(Number(tokenId));
  if (!token) throw new Error('Token does not exist');
  if (token.currentOwner.toLowerCase() !== sellerAddress.toLowerCase()) {
    throw new Error('Not token owner');
  }

  // Multi-license: check if THIS license type is already listed (not any license type)
  const tokenListings = getTokenListings(tokenId);
  if (tokenListings.has(actualLicenseType) && tokenListings.get(actualLicenseType).active) {
    throw new Error('Already listed for this license type');
  }

  // Cannot sell more rights than you have
  if (actualLicenseType > token.ownerLicense) {
    throw new Error('Cannot escalate rights');
  }

  // License tokens (non-original) cannot sub-license
  // They can only be sold via Transfer (which transfers the token itself)
  if (!token.isOriginal && actualLicenseType !== LicenseType.Transfer) {
    throw new Error('License tokens cannot sub-license');
  }

  const nonce = mockNonces.get(sellerAddress.toLowerCase()) || 0;
  mockNonces.set(sellerAddress.toLowerCase(), nonce + 1);

  // Multi-license: store listing by tokenId AND licenseType
  tokenListings.set(actualLicenseType, {
    seller: sellerAddress,
    price: price,
    licenseType: actualLicenseType,
    licenseHash: licenseHash,
    nonce: nonce,
    expiry: expiry || 0,
    sellerSignature: signature,
    active: true
  });
  saveMockState();

  const transactionHash = '0x' + crypto.randomBytes(32).toString('hex');
  const result = { tokenId, price, licenseType: actualLicenseType, transactionHash };
  const events = [E.tokenListed({ tokenId: Number(tokenId), price, licenseType: actualLicenseType, transactionHash, mock: true })];
  return [result, events];
}

/**
 * Delist a specific license type listing
 * @param {number} tokenId
 * @param {number} licenseType
 * @param {string} sellerAddress
 */
async function delistToken(tokenId, licenseType, sellerAddress) {
  const tokenListings = getTokenListings(tokenId);
  const listing = tokenListings.get(Number(licenseType));
  if (!listing || !listing.active) throw new Error('Not listed for this license type');
  if (listing.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
    throw new Error('Not the seller');
  }

  listing.active = false;
  saveMockState();
  const result = { tokenId, licenseType };
  const events = [E.tokenDelisted({ tokenId: Number(tokenId), licenseType: Number(licenseType), mock: true })];
  return [result, events];
}

/**
 * Delist all license types for a token
 * @param {number} tokenId
 * @param {string} sellerAddress
 */
async function delistAllToken(tokenId, sellerAddress) {
  const token = mockTokens.get(Number(tokenId));
  if (!token) throw new Error('Token does not exist');
  if (token.currentOwner.toLowerCase() !== sellerAddress.toLowerCase()) {
    throw new Error('Not token owner');
  }

  const tokenListings = getTokenListings(tokenId);
  let anyDelisted = false;
  for (const [licenseType, listing] of tokenListings) {
    if (listing.active) {
      listing.active = false;
      anyDelisted = true;
    }
  }

  if (!anyDelisted) {
    throw new Error('No active listings');
  }

  saveMockState();
  const result = { tokenId };
  const events = [E.tokenDelistedAll({ tokenId: Number(tokenId), mock: true })];
  return [result, events];
}

/**
 * Buy a listed token.
 * Multi-license: specify which license type listing to buy.
 *
 * @param {number} tokenId
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {string} signature - Buyer's EIP-712 signature
 * @param {string} buyerAddress - Address of the buyer
 */
async function buyToken(tokenId, licenseType, signature, buyerAddress) {
  const tokenListings = getTokenListings(tokenId);
  const listing = tokenListings.get(Number(licenseType));

  if (!listing || !listing.active) throw new Error('Not listed for this license type');
  if (listing.seller.toLowerCase() === buyerAddress.toLowerCase()) {
    throw new Error('Cannot buy own token');
  }

  const token = mockTokens.get(Number(tokenId));
  const previousOwner = token.currentOwner;

  // Clear this specific listing
  listing.active = false;

  // Handle license rights based on license type
  if (licenseType === LicenseType.Transfer || !token.isOriginal) {
    // Transfer sale OR license token sale: actual token transfer
    // Clear ALL listings since ownership is changing
    for (const [lt, l] of tokenListings) {
      l.active = false;
    }

    if (licenseType === LicenseType.Transfer && token.isOriginal) {
      // Original token Transfer sale: transfer with copyright
      // Seller retains display rights
      if (!mockDisplayRights.has(Number(tokenId))) {
        mockDisplayRights.set(Number(tokenId), new Set());
      }
      mockDisplayRights.get(Number(tokenId)).add(previousOwner.toLowerCase());

      // Buyer becomes new copyright owner with Transfer rights
      token.copyrightOwner = buyerAddress;
      token.ownerLicense = LicenseType.Transfer;
    }

    token.currentOwner = buyerAddress;

    saveMockState();

    const result = {
      tokenId,
      seller: previousOwner,
      buyer: buyerAddress,
      price: listing.price,
      licenseType: licenseType,
      sellerSignature: listing.sellerSignature,
      buyerSignature: signature
    };
    const events = [E.tokenSold({
      tokenId: Number(tokenId), seller: previousOwner, buyer: buyerAddress,
      price: listing.price, licenseType: licenseType, mock: true
    })];
    return [result, events];
  } else {
    // Display/Commercial sale from original: mint new license token for buyer
    // Original token stays with seller who keeps copyright
    // OTHER listings remain active (seller can still sell other license types)
    mockTokenCounter++;
    const newTokenId = mockTokenCounter;

    mockTokens.set(newTokenId, {
      creator: token.creator,              // Original creator preserved
      currentOwner: buyerAddress,          // Buyer owns the new license token
      copyrightOwner: token.copyrightOwner, // Copyright stays with original owner
      ownerLicense: licenseType,            // License level purchased
      licenseHash: listing.licenseHash,
      imageHash: token.imageHash,           // Same image
      mintedAt: new Date(),
      ipfsUri: token.ipfsUri,               // Same IPFS image
      uri: token.uri,
      parentToken: Number(tokenId),         // Direct parent in license chain
      originalToken: token.originalToken,   // Root of provenance chain
      isOriginal: false,                    // This is a license, not original
      authorityId: token.authorityId || 0,  // Inherit authority from parent
      minter: token.minter || 'mock-minter' // Inherit minter from parent
    });

    saveMockState();

    const result = {
      tokenId: newTokenId,  // Return the new license token ID
      parentTokenId: tokenId,
      seller: previousOwner,
      buyer: buyerAddress,
      price: listing.price,
      licenseType: licenseType,
      sellerSignature: listing.sellerSignature,
      buyerSignature: signature,
      isLicenseGrant: true
    };
    const events = [E.licenseGranted({
      newTokenId, parentTokenId: Number(tokenId), buyer: buyerAddress,
      licenseType: licenseType, mock: true
    })];
    return [result, events];
  }
}

/**
 * Get listing info for a specific license type
 */
async function getListing(tokenId, licenseType) {
  const tokenListings = getTokenListings(tokenId);
  const listing = tokenListings.get(Number(licenseType));
  if (!listing) {
    return { seller: null, price: '0', licenseType: licenseType, licenseHash: null, nonce: 0, expiry: 0, active: false };
  }
  return listing;
}

/**
 * Get all listings for a token (all license types)
 */
async function getAllListingsForToken(tokenId) {
  const tokenListings = getTokenListings(tokenId);
  const result = {
    display: { price: '0', active: false },
    commercial: { price: '0', active: false },
    transfer: { price: '0', active: false }
  };

  const displayListing = tokenListings.get(LicenseType.Display);
  if (displayListing) {
    result.display = { ...displayListing };
  }

  const commercialListing = tokenListings.get(LicenseType.Commercial);
  if (commercialListing) {
    result.commercial = { ...commercialListing };
  }

  const transferListing = tokenListings.get(LicenseType.Transfer);
  if (transferListing) {
    result.transfer = { ...transferListing };
  }

  return result;
}

/**
 * Get all active listings (multi-license: may have multiple listings per token)
 */
async function getActiveListings() {
  const listings = [];
  for (const [tokenId, tokenListings] of mockListings) {
    const token = mockTokens.get(tokenId);
    for (const [licenseType, listing] of tokenListings) {
      if (listing.active) {
        listings.push({
          tokenId,
          licenseType,
          ...listing,
          ...token
        });
      }
    }
  }
  return listings;
}

// ── Event listener ────────────────────────────────────────────────────────────

/**
 * Event listener not available in mock mode — returns no-op cleanup
 */
function startEventListener(callbacks = {}) {
  console.log('[Blockchain] Event listener not available in mock mode');
  return () => {};
}

// ── Sync helper ───────────────────────────────────────────────────────────────

/**
 * Get all tokens from mock storage
 */
async function getAllTokens() {
  const supply = await totalSupply();
  const tokens = [];

  for (let i = 0; i < supply; i++) {
    try {
      const tokenData = await getTokenData(i);
      tokens.push({
        tokenId: i,
        ...tokenData
      });
    } catch (e) {
      console.warn(`[Blockchain] Could not fetch token ${i}:`, e.message);
    }
  }

  return tokens;
}

/**
 * Get the highest license level a buyer already owns for a given original image
 */
async function getBuyerExistingLicenseLevel(buyerAddress, originalTokenId) {
  const normalizedBuyer = buyerAddress.toLowerCase();
  let highestLevel = null;

  for (const [tokenId, token] of mockTokens) {
    if (token.currentOwner.toLowerCase() !== normalizedBuyer) continue;

    const tokenOriginal = token.isOriginal ? tokenId : token.originalToken;
    if (tokenOriginal !== originalTokenId) continue;

    const level = token.ownerLicense;
    if (highestLevel === null || level > highestLevel) {
      highestLevel = level;
    }
  }
  return highestLevel;
}

// ── Test utilities ────────────────────────────────────────────────────────────

/**
 * Reset mock state (for testing)
 */
function resetMock() {
  mockTokens.clear();
  mockListings.clear();
  mockNonces.clear();
  mockDisplayRights.clear();
  mockTokenCounter = 0;
  saveMockState();
  // Clear token-repository cache so tests see fresh state
  try {
    const tokenRepository = require('../token-repository');
    tokenRepository.cache.clear();
  } catch (_) { /* token-repository may not be loaded */ }
}

/**
 * Get mock tokens (for testing)
 */
function getMockTokens() {
  return mockTokens;
}

module.exports = {
  reserveTokenId,
  mint,
  isOwner,
  ownerOf,
  tokenURI,
  getTokenData,
  getProvenanceChain,
  isImageRegistered,
  totalSupply,
  checkDisplayRights,
  checkCommercialRights,
  checkCopyrightOwnership,
  getMaxSellableLicense,
  getBuyerExistingLicenseLevel,
  getEIP712Domain,
  getNonce,
  getListingTypedData,
  getPurchaseTypedData,
  listToken,
  delistToken,
  delistAllToken,
  buyToken,
  getListing,
  getAllListingsForToken,
  getActiveListings,
  startEventListener,
  getAllTokens,
  resetMock,
  getMockTokens,
};
