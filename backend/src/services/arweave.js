/**
 * Arweave Service
 * Permanent storage for license documents
 *
 * Arweave stores data forever with a one-time payment.
 * Perfect for legal documents that need to be verifiable decades from now.
 */

const Arweave = require('arweave');
const crypto = require('crypto');

const E = require('../events/types');
const { retry } = require('../utils/retry');

const USE_MOCK = process.env.USE_MOCK_ARWEAVE === 'true';

// Persistent store for mock mode
const persistence = require('./mock-persistence');
const mockStore = USE_MOCK ? persistence.loadMap('arweave') : new Map();

function saveMockStore() {
  if (USE_MOCK) {
    persistence.saveMap('arweave', mockStore);
  }
}

// Arweave client configuration
let arweave = null;
let wallet = null;

function getArweave() {
  if (!arweave) {
    // Use arweave.net gateway in production
    // For testing, can use ArLocal (local Arweave testnet)
    arweave = Arweave.init({
      host: process.env.ARWEAVE_HOST || 'arweave.net',
      port: process.env.ARWEAVE_PORT || 443,
      protocol: process.env.ARWEAVE_PROTOCOL || 'https',
      timeout: 60000,
    });
  }
  return arweave;
}

async function getWallet() {
  if (!wallet) {
    const walletJson = process.env.ARWEAVE_WALLET_JSON;
    if (!walletJson) {
      throw new Error('ARWEAVE_WALLET_JSON environment variable required');
    }
    wallet = JSON.parse(walletJson);
  }
  return wallet;
}

/**
 * Upload data to Arweave
 * @param {Buffer|string} data - Data to upload
 * @param {string} contentType - MIME type
 * @param {Object} tags - Additional tags for the transaction
 * @returns {Promise<{txId: string, hash: string}>} - Transaction ID and content hash
 */
async function upload(data, contentType, tags = {}) {
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const hash = crypto.createHash('sha256').update(dataBuffer).digest('hex');

  if (USE_MOCK) {
    const txId = 'mock_' + crypto.randomBytes(32).toString('base64url');
    mockStore.set(txId, {
      data: dataBuffer,
      contentType,
      tags,
      hash,
      timestamp: Date.now()
    });
    saveMockStore();
    const result = { txId, hash: '0x' + hash };
    return [result, [E.arweaveUploaded({ txId, hash: '0x' + hash, contentType, mock: true })]];
  }

  const ar = getArweave();
  const arWallet = await getWallet();

  // Create transaction
  const tx = await ar.createTransaction({ data: dataBuffer }, arWallet);

  // Set content type
  tx.addTag('Content-Type', contentType);

  // Add custom tags
  for (const [key, value] of Object.entries(tags)) {
    tx.addTag(key, String(value));
  }

  // Add app identifier
  tx.addTag('App-Name', 'NFTmarket');
  tx.addTag('App-Version', '1.0.0');

  // Sign and submit
  await ar.transactions.sign(tx, arWallet);
  const response = await ar.transactions.post(tx);

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Arweave upload failed: ${response.status} ${response.statusText}`);
  }

  const result = { txId: tx.id, hash: '0x' + hash };
  return [result, [E.arweaveUploaded({ txId: tx.id, hash: '0x' + hash, contentType, mock: false })]];
}

/**
 * Upload JSON document to Arweave
 * @param {Object} json - JSON object to upload
 * @param {Object} tags - Additional tags
 * @returns {Promise<{txId: string, hash: string}>}
 */
async function uploadJson(json, tags = {}) {
  const data = JSON.stringify(json, null, 2);
  return upload(data, 'application/json', tags);  // Returns [result, events] from upload()
}

/**
 * Get gateway URL for an Arweave transaction
 * @param {string} txId - Arweave transaction ID
 * @returns {string} - HTTP URL to access the data
 */
function getGatewayUrl(txId) {
  if (USE_MOCK) {
    return `http://localhost:3000/arweave/${txId}`;
  }
  return `https://arweave.net/${txId}`;
}

/**
 * Fetch data from Arweave
 * @param {string} txId - Transaction ID
 * @returns {Promise<Buffer>} - Data
 */
async function fetchData(txId) {
  if (USE_MOCK) {
    const stored = mockStore.get(txId);
    if (!stored) {
      throw new Error(`Mock Arweave: Transaction ${txId} not found`);
    }
    return stored.data;
  }

  const ar = getArweave();
  const data = await retry(() => ar.transactions.getData(txId, { decode: true }));
  return Buffer.from(data);
}

/**
 * Get transaction status
 * @param {string} txId - Transaction ID
 * @returns {Promise<{confirmed: boolean, blockHeight: number|null}>}
 */
async function getStatus(txId) {
  if (USE_MOCK) {
    const stored = mockStore.get(txId);
    return {
      confirmed: !!stored,
      blockHeight: stored ? 1000000 : null
    };
  }

  const ar = getArweave();
  try {
    const status = await ar.transactions.getStatus(txId);
    return {
      confirmed: status.status === 200,
      blockHeight: status.confirmed?.block_height || null
    };
  } catch (e) {
    return { confirmed: false, blockHeight: null };
  }
}

/**
 * Check wallet balance (in AR)
 * @returns {Promise<string>} - Balance in AR
 */
async function getBalance() {
  if (USE_MOCK) {
    return '100.000000000000';
  }

  const ar = getArweave();
  const arWallet = await getWallet();
  const address = await ar.wallets.jwkToAddress(arWallet);
  const winston = await ar.wallets.getBalance(address);
  return ar.ar.winstonToAr(winston);
}

/**
 * Estimate upload cost
 * @param {number} bytes - Data size in bytes
 * @returns {Promise<{winston: string, ar: string}>} - Cost in winston and AR
 */
async function estimateCost(bytes) {
  if (USE_MOCK) {
    return { winston: '0', ar: '0.000000000000' };
  }

  const ar = getArweave();
  const winston = await ar.transactions.getPrice(bytes);
  return {
    winston: winston.toString(),
    ar: ar.ar.winstonToAr(winston)
  };
}

/**
 * Verify document hash matches Arweave content
 * @param {string} txId - Transaction ID
 * @param {string} expectedHash - Expected SHA-256 hash (0x prefixed)
 * @returns {Promise<boolean>}
 */
async function verifyHash(txId, expectedHash) {
  const data = await fetchData(txId);
  const actualHash = '0x' + crypto.createHash('sha256').update(data).digest('hex');
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}

// ── Metadata Cache (Arweave data is immutable — safe to cache indefinitely) ──
const METADATA_CACHE_MAX = 1000;
const metadataCache = new Map();

/**
 * Fetch JSON metadata from Arweave, applying schema migrations.
 * Results are cached indefinitely since Arweave data is immutable.
 * Cache is bounded to METADATA_CACHE_MAX entries (oldest evicted first).
 * @param {string} uri - Arweave URI (ar://txId or just txId)
 * @returns {Promise<Object>} - Parsed and normalized JSON metadata
 */
async function fetchMetadata(uri) {
  const txId = uri.startsWith('ar://') ? uri.slice(5) : uri;

  const cached = metadataCache.get(txId);
  if (cached) return cached;

  const data = await fetchData(txId);
  const raw = JSON.parse(data.toString('utf8'));
  const normalized = normalizeMetadata(raw);

  // Evict oldest entry if cache is full
  if (metadataCache.size >= METADATA_CACHE_MAX) {
    const oldest = metadataCache.keys().next().value;
    metadataCache.delete(oldest);
  }
  metadataCache.set(txId, normalized);

  return normalized;
}

// ── Schema Versioning (Memento Pattern) ─────────────────────
//
// Arweave data is immutable. Once uploaded, it cannot be changed.
// Schema evolution is handled by:
// 1. New writes include schemaVersion
// 2. Reads apply migration functions to normalize old data

const CURRENT_SCHEMA_VERSION = 2;

/**
 * Schema migrations — each transforms data from version N to N+1
 */
const MIGRATIONS = {
  // v1 → v2: Add schemaVersion, normalize license type names
  1: (data) => ({
    ...data,
    schemaVersion: 2,
    properties: {
      ...data.properties,
      // Ensure license_type is present (may be missing in v1)
      license_type: data.properties?.license_type || undefined,
    }
  }),
};

/**
 * Normalize metadata to the latest schema version.
 * Old metadata without schemaVersion is treated as v1.
 * @param {Object} raw - Raw metadata from Arweave
 * @returns {Object} - Normalized metadata
 */
function normalizeMetadata(raw) {
  let version = raw.schemaVersion || 1;
  let data = { ...raw };

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) break;
    data = migrate(data);
    version = data.schemaVersion || version + 1;
  }

  return data;
}

/**
 * Stamp metadata with the current schema version before upload.
 * Call this on all new metadata before passing to uploadJson.
 * @param {Object} metadata - Metadata to stamp
 * @returns {Object} - Metadata with schemaVersion
 */
function stampSchemaVersion(metadata) {
  return {
    ...metadata,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

module.exports = {
  upload,
  uploadJson,
  getGatewayUrl,
  fetchData,
  fetchMetadata,
  getStatus,
  getBalance,
  estimateCost,
  verifyHash,
  // Schema versioning
  stampSchemaVersion,
  normalizeMetadata,
  CURRENT_SCHEMA_VERSION,
};
