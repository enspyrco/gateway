/**
 * IPFS Service
 * Uses Pinata for pinning files to IPFS
 */

const { PinataSDK } = require("pinata");
const crypto = require("crypto");

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
const USE_MOCK_IPFS = process.env.USE_MOCK_IPFS === "true";

// In-memory store for mock mode
const mockStore = new Map();

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
  if (USE_MOCK_IPFS) {
    const hash = "Qm" + crypto.createHash("sha256").update(data).digest("hex").slice(0, 44);
    mockStore.set(hash, data);
    console.log(`MOCK IPFS: Stored ${filename} as ${hash}`);
    return `ipfs://${hash}`;
  }

  const client = getPinata();

  // Create a File object from buffer
  const file = new File([data], filename, {
    type: getMimeType(filename),
  });

  const result = await client.upload.file(file);

  return `ipfs://${result.IpfsHash}`;
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
    console.log(`MOCK IPFS: Stored ${filename} as ${hash}`);
    return `ipfs://${hash}`;
  }

  const client = getPinata();

  const result = await client.upload.json(json, {
    metadata: {
      name: filename,
    },
  });

  return `ipfs://${result.IpfsHash}`;
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

  // In mock mode, serve from local backend
  if (USE_MOCK_IPFS) {
    return `http://localhost:3000/ipfs/${hash}`;
  }

  return `https://${PINATA_GATEWAY}/ipfs/${hash}`;
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
  const response = await client.gateways.get(hash);
  return Buffer.from(await response.arrayBuffer());
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
};
