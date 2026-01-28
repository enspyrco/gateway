/**
 * Firestore Service
 * Token metadata and key storage
 */

const admin = require("firebase-admin");

const USE_MOCK_FIRESTORE = process.env.USE_MOCK_FIRESTORE === "true";

// In-memory stores for mock mode
const mockTokens = new Map();
const mockKeys = new Map();
const mockDetections = [];

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
        // Use explicit service account JSON
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId,
        });
      } else {
        // Use Application Default Credentials (gcloud auth application-default login)
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
 * Create a new token record
 */
async function createToken(data) {
  const tokenDoc = {
    tokenId: data.tokenId,
    mintId: data.mintId,
    wallet: data.wallet,
    currentOwner: data.wallet, // Initially, creator is the owner
    name: data.name,
    description: data.description || "",
    licenseType: data.licenseType,
    imageHash: data.imageHash,
    licenseHash: data.licenseHash,
    watermarkId: data.watermarkId,
    keyId: data.keyId,
    encryptedBlobUri: data.encryptedBlobUri,
    previewUri: data.previewUri,
    metadataUri: data.metadataUri,
    transactionHash: data.transactionHash,
    createdAt: data.createdAt,
  };

  if (USE_MOCK_FIRESTORE) {
    mockTokens.set(String(data.tokenId), tokenDoc);
    console.log(`MOCK FIRESTORE: Created token ${data.tokenId}`);
    return tokenDoc;
  }

  tokenDoc.createdAt = admin.firestore.Timestamp.fromDate(data.createdAt);
  const db = getDb();
  await db.collection("tokens").doc(String(data.tokenId)).set(tokenDoc);

  return tokenDoc;
}

/**
 * Get token by ID
 */
async function getToken(tokenId) {
  if (USE_MOCK_FIRESTORE) {
    return mockTokens.get(String(tokenId)) || null;
  }

  const db = getDb();
  const doc = await db.collection("tokens").doc(String(tokenId)).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data();
}

/**
 * Get tokens by wallet (creator)
 */
async function getTokensByWallet(wallet, limit = 50) {
  if (USE_MOCK_FIRESTORE) {
    const tokens = Array.from(mockTokens.values())
      .filter((t) => t.wallet?.toLowerCase() === wallet.toLowerCase())
      .slice(0, limit);
    return tokens;
  }

  const db = getDb();
  const snapshot = await db
    .collection("tokens")
    .where("wallet", "==", wallet.toLowerCase())
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Get tokens by current owner
 * Falls back to wallet (creator) for older tokens without currentOwner field
 */
async function getTokensByOwner(ownerAddress, limit = 50) {
  const normalizedAddress = ownerAddress.toLowerCase();

  if (USE_MOCK_FIRESTORE) {
    const tokens = Array.from(mockTokens.values())
      .filter((t) =>
        t.currentOwner?.toLowerCase() === normalizedAddress ||
        (!t.currentOwner && t.wallet?.toLowerCase() === normalizedAddress)
      )
      .slice(0, limit);
    return tokens;
  }

  const db = getDb();

  // Query tokens with currentOwner set
  const currentOwnerSnapshot = await db
    .collection("tokens")
    .where("currentOwner", "==", normalizedAddress)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  // Query tokens by wallet (creator) for backward compatibility
  // These are tokens where the creator still owns them (no transfers)
  const walletSnapshot = await db
    .collection("tokens")
    .where("wallet", "==", normalizedAddress)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  // Merge results, avoiding duplicates
  const tokenMap = new Map();

  for (const doc of currentOwnerSnapshot.docs) {
    tokenMap.set(doc.id, doc.data());
  }

  for (const doc of walletSnapshot.docs) {
    const data = doc.data();
    // Only include if no currentOwner set (legacy token still with creator)
    if (!data.currentOwner && !tokenMap.has(doc.id)) {
      tokenMap.set(doc.id, data);
    }
  }

  return Array.from(tokenMap.values())
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, limit);
}

/**
 * Update token owner (after purchase)
 */
async function updateTokenOwner(tokenId, newOwner) {
  if (USE_MOCK_FIRESTORE) {
    const token = mockTokens.get(String(tokenId));
    if (token) {
      token.currentOwner = newOwner.toLowerCase();
      mockTokens.set(String(tokenId), token);
      console.log(`MOCK FIRESTORE: Updated token ${tokenId} owner to ${newOwner}`);
    }
    return;
  }

  const db = getDb();
  await db.collection("tokens").doc(String(tokenId)).update({
    currentOwner: newOwner.toLowerCase(),
  });
}

/**
 * Get list of galleries (unique wallets with NFTs)
 */
async function getGalleryList(limit = 20) {
  if (USE_MOCK_FIRESTORE) {
    const ownerMap = new Map();
    for (const token of mockTokens.values()) {
      const owner = token.currentOwner || token.wallet;
      if (owner) {
        const existing = ownerMap.get(owner.toLowerCase()) || { tokenCount: 0, latestToken: null };
        existing.tokenCount++;
        if (!existing.latestToken || (token.createdAt > existing.latestToken.createdAt)) {
          existing.latestToken = token;
        }
        ownerMap.set(owner.toLowerCase(), existing);
      }
    }
    return Array.from(ownerMap.entries())
      .map(([address, data]) => ({
        address,
        tokenCount: data.tokenCount,
        previewTokenName: data.latestToken?.name || `NFTmarket #${data.latestToken?.tokenId}`,
      }))
      .slice(0, limit);
  }

  const db = getDb();
  const snapshot = await db
    .collection("tokens")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const ownerMap = new Map();
  for (const doc of snapshot.docs) {
    const token = doc.data();
    const owner = (token.currentOwner || token.wallet || '').toLowerCase();
    if (owner) {
      const existing = ownerMap.get(owner) || { tokenCount: 0, latestToken: null };
      existing.tokenCount++;
      if (!existing.latestToken) {
        existing.latestToken = token;
      }
      ownerMap.set(owner, existing);
    }
  }

  return Array.from(ownerMap.entries())
    .map(([address, data]) => ({
      address,
      tokenCount: data.tokenCount,
      previewTokenName: data.latestToken?.name || `NFTmarket #${data.latestToken?.tokenId}`,
    }))
    .slice(0, limit);
}

/**
 * Store encrypted key reference
 */
async function storeKey(tokenId, keyData) {
  const keyDoc = {
    tokenId,
    keyId: keyData.keyId,
    imageHash: keyData.imageHash,
    createdAt: new Date(),
  };

  if (USE_MOCK_FIRESTORE) {
    mockKeys.set(String(tokenId), keyDoc);
    console.log(`MOCK FIRESTORE: Stored key for token ${tokenId}`);
    return;
  }

  const db = getDb();
  await db.collection("keys").doc(String(tokenId)).set({
    ...keyDoc,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get key reference
 */
async function getKey(tokenId) {
  if (USE_MOCK_FIRESTORE) {
    return mockKeys.get(String(tokenId)) || null;
  }

  const db = getDb();
  const doc = await db.collection("keys").doc(String(tokenId)).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data();
}

/**
 * Log a detection request
 */
async function logDetection(data) {
  const detectionDoc = {
    id: `detection_${Date.now()}`,
    tokenId: data.tokenId,
    requester: data.requester,
    capturedImageHash: data.capturedImageHash,
    result: data.result,
    confidence: data.confidence,
    timestamp: new Date(),
  };

  if (USE_MOCK_FIRESTORE) {
    mockDetections.push(detectionDoc);
    console.log(`MOCK FIRESTORE: Logged detection for token ${data.tokenId}`);
    return;
  }

  const db = getDb();
  await db.collection("detections").add({
    tokenId: data.tokenId,
    requester: data.requester,
    capturedImageHash: data.capturedImageHash,
    result: data.result,
    confidence: data.confidence,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get detection history for a token
 */
async function getDetectionHistory(tokenId, limit = 20) {
  if (USE_MOCK_FIRESTORE) {
    return mockDetections
      .filter((d) => d.tokenId === tokenId)
      .slice(0, limit);
  }

  const db = getDb();
  const snapshot = await db
    .collection("detections")
    .where("tokenId", "==", tokenId)
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Reset mock state (for testing)
 */
function resetMock() {
  mockTokens.clear();
  mockKeys.clear();
  mockDetections.length = 0;
}

module.exports = {
  getDb,
  createToken,
  getToken,
  getTokensByWallet,
  getTokensByOwner,
  updateTokenOwner,
  getGalleryList,
  storeKey,
  getKey,
  logDetection,
  getDetectionHistory,
  resetMock,
};
