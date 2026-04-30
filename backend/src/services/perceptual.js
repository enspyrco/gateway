/**
 * Perceptual Hashing Service (stub)
 * Registers perceptual hashes for infringement detection.
 * Allows matching even when the watermark doesn't survive (print-camera).
 */

// In-memory store for perceptual hashes
const hashStore = new Map();

/**
 * Register perceptual hashes for an image
 * @param {string} tokenId - Token ID
 * @param {Buffer} imageBuffer - Image data
 * @param {Object} metadata - Additional metadata (wallet, name, imageHash)
 */
async function register(tokenId, imageBuffer, metadata = {}) {
  hashStore.set(tokenId, {
    ...metadata,
    registeredAt: new Date(),
  });
}

/**
 * Get stats about the perceptual hash database
 */
function getStats() {
  return {
    totalRegistered: hashStore.size,
  };
}

/**
 * Reset store (for testing)
 */
function resetMock() {
  hashStore.clear();
}

module.exports = {
  register,
  getStats,
  resetMock,
};
