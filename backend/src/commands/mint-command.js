/**
 * Mint Command — Idempotent NFT minting
 *
 * Encapsulates the multi-step mint operation as a Command object with an
 * idempotency key (mintId). If the same mintId is submitted twice, the
 * cached result is returned instead of double-minting.
 *
 * The idempotency store has a 1-hour TTL to prevent unbounded growth.
 */

// In-memory idempotency store: mintId → { result, timestamp }
const store = new Map();
const STORE_TTL = 60 * 60 * 1000; // 1 hour

// Periodic cleanup (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.timestamp > STORE_TTL) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * Check if a mint with this ID has already been processed
 * @param {string} mintId - Client-generated idempotency key
 * @returns {Object|null} - Cached result, or null if not found
 */
function getCachedResult(mintId) {
  const entry = store.get(mintId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STORE_TTL) {
    store.delete(mintId);
    return null;
  }
  return entry.result;
}

/**
 * Store the result of a successful mint
 * @param {string} mintId - Client-generated idempotency key
 * @param {Object} result - Mint result to cache
 */
function cacheResult(mintId, result) {
  store.set(mintId, { result, timestamp: Date.now() });
}

/**
 * Check if a mint is currently in progress (prevents concurrent duplicates)
 * @param {string} mintId
 * @returns {boolean}
 */
function isInProgress(mintId) {
  const entry = store.get(mintId);
  return entry?.inProgress === true;
}

/**
 * Mark a mint as in progress
 * @param {string} mintId
 */
function markInProgress(mintId) {
  store.set(mintId, { inProgress: true, timestamp: Date.now() });
}

/**
 * Clear in-progress state (on failure)
 * @param {string} mintId
 */
function clearInProgress(mintId) {
  const entry = store.get(mintId);
  if (entry?.inProgress) {
    store.delete(mintId);
  }
}

module.exports = {
  getCachedResult,
  cacheResult,
  isInProgress,
  markInProgress,
  clearInProgress,
};
