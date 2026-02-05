/**
 * Firestore Service
 *
 * ONLY stores references to encrypted originals in Firebase Storage.
 *
 * Storage architecture:
 * - Blockchain: token ownership, IPFS URI, Arweave URI, license info, provenance
 * - Arweave: metadata JSON (name, description) and license text
 * - IPFS: watermarked preview images
 * - Firebase Storage: encrypted original images
 * - Firestore: encrypted original storage paths (this service)
 * - KMS: encryption keys
 */

const admin = require("firebase-admin");

const USE_MOCK_FIRESTORE = process.env.USE_MOCK_FIRESTORE === "true";

// In-memory store for mock mode
const persistence = require('./mock-persistence');
let mockEncryptedRefs = USE_MOCK_FIRESTORE ? persistence.loadMap('firestore-encrypted') : new Map();

function saveMockData() {
  if (USE_MOCK_FIRESTORE) {
    persistence.saveMap('firestore-encrypted', mockEncryptedRefs);
  }
}

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
 * Store reference to encrypted original
 * Called after minting to record where the encrypted original is stored
 */
async function storeEncryptedRef(tokenId, data) {
  const ref = {
    tokenId,
    storagePath: data.storagePath,  // Firebase Storage path
    keyId: data.keyId,              // KMS key reference
    imageHash: data.imageHash,      // For verification
    createdAt: new Date().toISOString(),
  };

  if (USE_MOCK_FIRESTORE) {
    mockEncryptedRefs.set(String(tokenId), ref);
    saveMockData();
    console.log(`[MOCK FIRESTORE] Stored encrypted ref for token ${tokenId}`);
    return ref;
  }

  const db = getDb();
  await db.collection("encrypted_originals").doc(String(tokenId)).set({
    ...ref,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return ref;
}

/**
 * Get reference to encrypted original
 * Used when owner wants to download original
 */
async function getEncryptedRef(tokenId) {
  if (USE_MOCK_FIRESTORE) {
    return mockEncryptedRefs.get(String(tokenId)) || null;
  }

  const db = getDb();
  const doc = await db.collection("encrypted_originals").doc(String(tokenId)).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data();
}

/**
 * Reset mock state (for testing)
 */
function resetMock() {
  mockEncryptedRefs.clear();
  saveMockData();
}

module.exports = {
  getDb,
  storeEncryptedRef,
  getEncryptedRef,
  resetMock,
};
