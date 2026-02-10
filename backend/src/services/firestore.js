/**
 * Firestore Service
 *
 * Currently unused - encrypted originals have been removed from the architecture.
 *
 * Storage architecture:
 * - Blockchain: token ownership, IPFS URI, Arweave URI, license info, provenance
 * - Arweave: metadata JSON (name, description) and license text
 * - IPFS: watermarked images (public)
 * - Perceptual hash DB: for infringement detection
 */

const admin = require("firebase-admin");

const USE_MOCK_FIRESTORE = process.env.USE_MOCK_FIRESTORE === "true";

// Initialize Firebase Admin (lazy)
let db = null;

function getDb() {
  if (USE_MOCK_FIRESTORE) {
    return null;
  }
  if (!db) {
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID || "enspyr-experiments";

      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId,
        });
      } else {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId,
        });
      }
    }
    db = admin.firestore();
  }
  return db;
}

/**
 * Reset mock state (for testing)
 */
function resetMock() {
  // No-op - no mock state to reset
}

module.exports = {
  getDb,
  resetMock,
};
