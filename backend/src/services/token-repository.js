/**
 * Token Repository with Cache
 *
 * Wraps blockchain service queries with a TTL cache to eliminate O(n) scans.
 * Cache is invalidated via blockchain event listener (Observer pattern).
 *
 * Provides pagination for gallery and marketplace listing queries.
 */

const blockchainService = require('./blockchain');

// Simple TTL cache implementation
class TTLCache {
  constructor(defaultTTL = 30000) {
    this._store = new Map();
    this._defaultTTL = defaultTTL;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttl) {
    this._store.set(key, {
      value,
      expiry: Date.now() + (ttl || this._defaultTTL),
    });
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidatePattern(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
  }

  clear() {
    this._store.clear();
  }
}

const cache = new TTLCache(30000); // 30 second default TTL

/**
 * Get all tokens with caching
 * @returns {Promise<Array>}
 */
async function getAllTokens() {
  const cached = cache.get('allTokens');
  if (cached) return cached;

  const tokens = await blockchainService.getAllTokens();
  cache.set('allTokens', tokens, 60000); // 1 minute TTL
  return tokens;
}

/**
 * Get single token data with caching
 * @param {number} tokenId
 * @returns {Promise<Object>}
 */
async function getTokenData(tokenId) {
  const key = `token:${tokenId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const data = await blockchainService.getTokenData(tokenId);
  cache.set(key, data); // 30s default TTL
  return data;
}

/**
 * Get all active listings with caching
 * @returns {Promise<Array>}
 */
async function getActiveListings() {
  const cached = cache.get('activeListings');
  if (cached) return cached;

  const listings = await blockchainService.getActiveListings();
  cache.set('activeListings', listings);
  return listings;
}

/**
 * Get active listings with pagination
 * @param {Object} options - { offset, limit }
 * @returns {Promise<{ listings: Array, total: number, offset: number, limit: number }>}
 */
async function getActiveListingsPaginated({ offset = 0, limit = 50 } = {}) {
  const all = await getActiveListings();
  return {
    listings: all.slice(offset, offset + limit),
    total: all.length,
    offset,
    limit,
  };
}

/**
 * Get tokens by owner with caching
 * @param {string} ownerAddress
 * @returns {Promise<Array>}
 */
async function getTokensByOwner(ownerAddress) {
  const key = `owner:${ownerAddress.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const allTokens = await getAllTokens();
  const owned = allTokens.filter(
    t => t.currentOwner?.toLowerCase() === ownerAddress.toLowerCase()
  );
  cache.set(key, owned);
  return owned;
}

/**
 * Get tokens by owner with pagination
 * @param {string} ownerAddress
 * @param {Object} options - { offset, limit }
 * @returns {Promise<{ tokens: Array, total: number, offset: number, limit: number }>}
 */
async function getTokensByOwnerPaginated(ownerAddress, { offset = 0, limit = 50 } = {}) {
  const all = await getTokensByOwner(ownerAddress);
  return {
    tokens: all.slice(offset, offset + limit),
    total: all.length,
    offset,
    limit,
  };
}

/**
 * Get the highest license level a buyer already owns for a given original image.
 * Cached per buyer+original pair.
 * @param {string} buyerAddress
 * @param {number} originalTokenId
 * @returns {Promise<number|null>}
 */
async function getBuyerExistingLicenseLevel(buyerAddress, originalTokenId) {
  const key = `license:${buyerAddress.toLowerCase()}:${originalTokenId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const level = await blockchainService.getBuyerExistingLicenseLevel(buyerAddress, originalTokenId);
  cache.set(key, level, 15000); // shorter TTL for license checks
  return level;
}

// ── Cache Invalidation (Observer callbacks) ──────────────────
// Wire these to blockchainService.startEventListener() in index.js

/**
 * Invalidate caches when a token is minted
 */
function onTokenMinted({ tokenId, creator }) {
  cache.invalidate('allTokens');
  cache.invalidate(`token:${tokenId}`);
  cache.invalidatePattern(`owner:${creator.toLowerCase()}`);
}

/**
 * Invalidate caches when a token is sold
 */
function onTokenSold({ tokenId, seller, buyer }) {
  cache.invalidate('allTokens');
  cache.invalidate(`token:${tokenId}`);
  cache.invalidate('activeListings');
  cache.invalidatePattern(`owner:${seller.toLowerCase()}`);
  cache.invalidatePattern(`owner:${buyer.toLowerCase()}`);
  cache.invalidatePattern(`license:${buyer.toLowerCase()}`);
}

/**
 * Invalidate caches when a token is listed or delisted
 */
function onListingChanged() {
  cache.invalidate('activeListings');
}

module.exports = {
  getAllTokens,
  getTokenData,
  getActiveListings,
  getActiveListingsPaginated,
  getTokensByOwner,
  getTokensByOwnerPaginated,
  getBuyerExistingLicenseLevel,
  // Cache management
  cache,
  // Event callbacks for Observer pattern
  onTokenMinted,
  onTokenSold,
  onListingChanged,
};
