/**
 * IPFS Service
 * Uses Pinata for pinning files to IPFS
 */

const { PinataSDK } = require("pinata");
const crypto = require("crypto");

const E = require('../events/types');
const { retry } = require('../utils/retry');

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
const USE_MOCK_IPFS = process.env.USE_MOCK_IPFS === "true";

// Persistent store for mock mode and upload cache
const persistence = require('./mock-persistence');
const mockStore = USE_MOCK_IPFS ? persistence.loadMap('ipfs') : new Map();

// Cache for Pinata uploads - avoid re-uploading same content
const uploadCache = persistence.loadMap('ipfs-cache');

// Auto-save on changes
function saveMockStore() {
  if (USE_MOCK_IPFS) {
    persistence.saveMap('ipfs', mockStore);
  }
}

let pinata = null;

function getPinata() {
  if (!pinata) {
    if (!PINATA_JWT) {
      throw new Error("PINATA_JWT environment variable required");
    }
    pinata = new PinataSDK({
      pinataJwt: PINATA_JWT,
      pinataGateway: PINATA_GATEWAY,
    });
  }
  return pinata;
}

/**
 * Upload a file to IPFS
 * @param {Buffer} data - File data
 * @param {string} filename - Filename for metadata
 * @returns {Promise<string>} - IPFS URI (ipfs://...)
 */
async function upload(data, filename) {
  // Compute content hash for caching
  const contentHash = crypto.createHash("sha256").update(data).digest("hex");
  const events = [];

  if (USE_MOCK_IPFS) {
    const hash = "Qm" + contentHash.slice(0, 44);
    mockStore.set(hash, data);
    saveMockStore();
    const uri = `ipfs://${hash}`;
    events.push(E.ipfsUploaded({ filename, cid: hash, uri, mock: true }));
    return [uri, events];
  }

  // Check cache first - same content = same CID
  const cached = uploadCache.get(contentHash);
  if (cached) {
    events.push(E.ipfsCacheHit({ filename, uri: cached }));
    return [cached, events];
  }

  const client = getPinata();

  // Create a File object from buffer
  const file = new File([data], filename, {
    type: getMimeType(filename),
  });

  const result = await retry(() => client.upload.public.file(file));
  const uri = `ipfs://${result.cid}`;

  // Cache the result
  uploadCache.set(contentHash, uri);
  persistence.saveMap('ipfs-cache', uploadCache);
  events.push(E.ipfsUploaded({ filename, cid: result.cid, uri, mock: false }));

  return [uri, events];
}

/**
 * Upload JSON metadata to IPFS
 * @param {Object} json - JSON object
 * @param {string} filename - Filename for metadata
 * @returns {Promise<string>} - IPFS URI
 */
async function uploadJson(json, filename) {
  if (USE_MOCK_IPFS) {
    const data = Buffer.from(JSON.stringify(json));
    const hash = "Qm" + crypto.createHash("sha256").update(data).digest("hex").slice(0, 44);
    mockStore.set(hash, data);
    saveMockStore();
    const uri = `ipfs://${hash}`;
    return [uri, [E.ipfsUploaded({ filename, cid: hash, uri, mock: true })]];
  }

  const client = getPinata();
  const result = await retry(() => client.upload.public.json(json));
  const uri = `ipfs://${result.cid}`;

  return [uri, [E.ipfsUploaded({ filename, cid: result.cid, uri, mock: false })]];
}

/**
 * Get gateway URL for an IPFS URI
 * @param {string} ipfsUri - IPFS URI (ipfs://...)
 * @returns {string} - HTTP gateway URL
 */
/**
 * Base URL for the IPFS proxy. Configurable via API_BASE_URL env var.
 * Defaults to http://localhost:3000 for local development.
 */
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

function getGatewayUrl(ipfsUri) {
  if (!ipfsUri.startsWith("ipfs://")) {
    return ipfsUri;
  }
  const hash = ipfsUri.replace("ipfs://", "");

  // Serve through backend proxy to avoid CORS issues
  // The /ipfs/:hash route fetches from Pinata (or mock) and serves to client
  return `${API_BASE_URL}/ipfs/${hash}`;
}

/**
 * Fetch content from IPFS
 * @param {string} ipfsUri - IPFS URI
 * @returns {Promise<Buffer>} - File contents
 */
async function fetch(ipfsUri) {
  const hash = ipfsUri.replace("ipfs://", "");

  if (USE_MOCK_IPFS) {
    const data = mockStore.get(hash);
    if (!data) {
      throw new Error(`Mock IPFS: Hash ${hash} not found`);
    }
    return data;
  }

  const client = getPinata();
  const response = await client.gateways.public.get(hash);
  return Buffer.from(await response.data.arrayBuffer());
}

/**
 * Unpin a file from IPFS (removes from Pinata)
 * @param {string} ipfsUri - IPFS URI (ipfs://...) or CID
 * @returns {Promise<boolean>} - true if unpinned successfully
 */
async function unpin(ipfsUri) {
  // Extract CID from URI if needed
  const cid = ipfsUri.startsWith("ipfs://")
    ? ipfsUri.replace("ipfs://", "")
    : ipfsUri;

  if (USE_MOCK_IPFS) {
    const existed = mockStore.has(cid);
    mockStore.delete(cid);
    saveMockStore();
    return [existed, [E.ipfsUnpinned({ cid, existed, mock: true })]];
  }

  const client = getPinata();

  try {
    // Pinata SDK v3 uses files.delete() for unpinning
    await client.files.delete([cid]);

    // Also remove from our upload cache if present
    for (const [hash, uri] of uploadCache.entries()) {
      if (uri === `ipfs://${cid}`) {
        uploadCache.delete(hash);
        persistence.saveMap('ipfs-cache', uploadCache);
        break;
      }
    }

    return [true, [E.ipfsUnpinned({ cid, existed: true, mock: false })]];
  } catch (error) {
    // Handle case where file wasn't pinned or already unpinned
    if (error.message?.includes('not found') || error.status === 404) {
      return [false, [E.ipfsUnpinned({ cid, existed: false, mock: false })]];
    }
    throw error;
  }
}

/**
 * List all pinned files (useful for cleanup)
 * @param {Object} options - Filter options
 * @param {number} options.limit - Max results (default 100)
 * @param {string} options.status - Pin status filter
 * @returns {Promise<Array>} - List of pinned files with CID and metadata
 */
async function listPins(options = {}) {
  const { limit = 100 } = options;

  if (USE_MOCK_IPFS) {
    const pins = Array.from(mockStore.keys()).map(cid => ({
      cid,
      size: mockStore.get(cid)?.length || 0,
      created: new Date().toISOString(),
    }));
    return pins.slice(0, limit);
  }

  const client = getPinata();

  const result = await client.files.list().limit(limit);

  return result.files.map(file => ({
    cid: file.cid,
    name: file.name,
    size: file.size,
    created: file.created_at,
    mimeType: file.mime_type,
  }));
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    json: "application/json",
  };
  return types[ext] || "application/octet-stream";
}

module.exports = {
  upload,
  uploadJson,
  getGatewayUrl,
  fetch,
  unpin,
  listPins,
};
