/**
 * Firebase Cloud Storage Service
 * Stores encrypted originals for dispute resolution
 */

const admin = require("firebase-admin");
const crypto = require("crypto");

const USE_MOCK_STORAGE = process.env.USE_MOCK_STORAGE === "true" || process.env.USE_MOCK_FIRESTORE === "true";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID || "enspyr-experiments"}.appspot.com`;

// Persistent store for mock mode
const persistence = require('./mock-persistence');
const mockStore = USE_MOCK_STORAGE ? persistence.loadMap('storage') : new Map();

function saveMockStore() {
  if (USE_MOCK_STORAGE) {
    persistence.saveMap('storage', mockStore);
  }
}

let bucket = null;

function getBucket() {
  if (USE_MOCK_STORAGE) {
    return null;
  }
  if (!bucket) {
    // Firebase Admin should already be initialized by firestore.js
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID || "enspyr-experiments";

      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId,
          storageBucket: STORAGE_BUCKET,
        });
      } else {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId,
          storageBucket: STORAGE_BUCKET,
        });
      }
    }
    bucket = admin.storage().bucket();
  }
  return bucket;
}

/**
 * Upload encrypted blob to Firebase Cloud Storage
 * @param {Buffer} data - Encrypted file data
 * @param {string} mintId - Unique mint identifier
 * @returns {Promise<string>} - Storage path (not a URL - access is controlled)
 */
async function uploadEncrypted(data, mintId) {
  const storagePath = `encrypted-originals/${mintId}`;

  if (USE_MOCK_STORAGE) {
    mockStore.set(storagePath, data);
    saveMockStore();
    console.log(`[MOCK STORAGE] Stored encrypted original: ${storagePath}`);
    return storagePath;
  }

  const bucket = getBucket();
  const file = bucket.file(storagePath);

  await file.save(data, {
    metadata: {
      contentType: "application/octet-stream",
      metadata: {
        mintId,
        uploadedAt: new Date().toISOString(),
      },
    },
    resumable: false,
  });

  console.log(`[STORAGE] Uploaded encrypted original: ${storagePath}`);
  return storagePath;
}

/**
 * Upload watermarked image as backup (in case IPFS becomes unavailable)
 * This is the full-resolution watermarked image, stored unencrypted.
 * @param {Buffer} data - Watermarked image data (PNG)
 * @param {string} mintId - Unique mint identifier
 * @returns {Promise<string>} - Storage path
 */
async function uploadWatermarked(data, mintId) {
  const storagePath = `watermarked/${mintId}.png`;

  if (USE_MOCK_STORAGE) {
    mockStore.set(storagePath, data);
    saveMockStore();
    console.log(`[MOCK STORAGE] Stored watermarked backup: ${storagePath}`);
    return storagePath;
  }

  const bucket = getBucket();
  const file = bucket.file(storagePath);

  await file.save(data, {
    metadata: {
      contentType: "image/png",
      metadata: {
        mintId,
        uploadedAt: new Date().toISOString(),
      },
    },
    resumable: false,
  });

  console.log(`[STORAGE] Uploaded watermarked backup: ${storagePath}`);
  return storagePath;
}

/**
 * Download watermarked image from Firebase Cloud Storage
 * @param {string} mintId - Mint identifier
 * @returns {Promise<Buffer>} - Watermarked image data
 */
async function downloadWatermarked(mintId) {
  const storagePath = `watermarked/${mintId}.png`;

  if (USE_MOCK_STORAGE) {
    const data = mockStore.get(storagePath);
    if (!data) {
      throw new Error(`Mock storage: ${storagePath} not found`);
    }
    return data;
  }

  const bucket = getBucket();
  const file = bucket.file(storagePath);
  const [data] = await file.download();
  return data;
}

/**
 * Download encrypted blob from Firebase Cloud Storage
 * @param {string} storagePath - Storage path returned from uploadEncrypted
 * @returns {Promise<Buffer>} - Encrypted file data
 */
async function downloadEncrypted(storagePath) {
  if (USE_MOCK_STORAGE) {
    const data = mockStore.get(storagePath);
    if (!data) {
      throw new Error(`Mock storage: ${storagePath} not found`);
    }
    return data;
  }

  const bucket = getBucket();
  const file = bucket.file(storagePath);

  const [data] = await file.download();
  return data;
}

/**
 * Check if encrypted blob exists
 * @param {string} storagePath - Storage path
 * @returns {Promise<boolean>}
 */
async function exists(storagePath) {
  if (USE_MOCK_STORAGE) {
    return mockStore.has(storagePath);
  }

  const bucket = getBucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  return exists;
}

/**
 * Delete encrypted blob (for cleanup or GDPR requests)
 * @param {string} storagePath - Storage path
 */
async function deleteEncrypted(storagePath) {
  if (USE_MOCK_STORAGE) {
    mockStore.delete(storagePath);
    saveMockStore();
    console.log(`[MOCK STORAGE] Deleted: ${storagePath}`);
    return;
  }

  const bucket = getBucket();
  const file = bucket.file(storagePath);
  await file.delete();
  console.log(`[STORAGE] Deleted: ${storagePath}`);
}

/**
 * Reset mock state (for testing)
 */
function resetMock() {
  mockStore.clear();
  saveMockStore();
}

module.exports = {
  uploadEncrypted,
  downloadEncrypted,
  uploadWatermarked,
  downloadWatermarked,
  exists,
  deleteEncrypted,
  resetMock,
};
