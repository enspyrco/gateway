/**
 * IPFS Service
 * Uses Pinata for pinning files to IPFS
 */

const { PinataSDK } = require("pinata");
const crypto = require("crypto");

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

  if (USE_MOCK_IPFS) {
    const hash = "Qm" + contentHash.slice(0, 44);
    mockStore.set(hash, data);
    saveMockStore();
    console.log(`[MOCK IPFS] Stored ${filename} as ${hash}`);
    return `ipfs://${hash}`;
  }

  // Check cache first - same content = same CID
  const cached = uploadCache.get(contentHash);
  if (cached) {
    console.log(`[IPFS] Cache hit for ${filename}`);
    return cached;
  }

  const client = getPinata();

  // Create a File object from buffer
  const file = new File([data], filename, {
    type: getMimeType(filename),
  });

  const result = await client.upload.public.file(file);
  const uri = `ipfs://${result.cid}`;

  // Cache the result
  uploadCache.set(contentHash, uri);
  persistence.saveMap('ipfs-cache', uploadCache);
  console.log(`[IPFS] Uploaded ${filename} -> ${result.cid}`);

  return uri;
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
    console.log(`[MOCK IPFS] Stored ${filename} as ${hash}`);
    return `ipfs://${hash}`;
  }

  const client = getPinata();

  const result = await client.upload.public.json(json);

  return `ipfs://${result.cid}`;
}

/**
 * Get gateway URL for an IPFS URI
 * @param {string} ipfsUri - IPFS URI (ipfs://...)
 * @returns {string} - HTTP gateway URL
 */
function getGatewayUrl(ipfsUri) {
  if (!ipfsUri.startsWith("ipfs://")) {
    return ipfsUri;
  }
  const hash = ipfsUri.replace("ipfs://", "");

  // Always serve through local backend proxy to avoid CORS issues
  // The /ipfs/:hash route fetches from Pinata (or mock) and serves to client
  return `http://localhost:3000/ipfs/${hash}`;
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
    console.log(`[MOCK IPFS] Unpinned ${cid} (existed: ${existed})`);
    return existed;
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

    console.log(`[IPFS] Unpinned ${cid}`);
    return true;
  } catch (error) {
    // Handle case where file wasn't pinned or already unpinned
    if (error.message?.includes('not found') || error.status === 404) {
      console.log(`[IPFS] ${cid} was not pinned or already unpinned`);
      return false;
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
    console.log(`[MOCK IPFS] Listed ${pins.length} pins`);
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
