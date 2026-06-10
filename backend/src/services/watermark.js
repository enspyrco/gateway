/**
 * Watermark Service
 * Interfaces with watermarking API or local C++ binary
 */

const { spawn } = require("child_process");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const E = require('../events/types');

const WATERMARK_API_URL = process.env.WATERMARK_API_URL;
const WATERMARK_API_KEY = process.env.WATERMARK_API_KEY;
const WATERMARK_BINARY = process.env.WATERMARK_BINARY || "./mark-image";
const WATERMARK_STRENGTH = process.env.WATERMARK_STRENGTH || "1.0";
const USE_MOCK_WATERMARK = process.env.USE_MOCK_WATERMARK === "true";

/**
 * Apply invisible watermark to image
 * @param {Buffer} imageBuffer - Original image
 * @param {string} walletAddress - Creator's wallet address
 * @param {number|string} tokenId - Token ID to embed
 * @returns {Promise<Buffer>} - Watermarked image
 */
async function applyWatermark(imageBuffer, walletAddress, tokenId) {
  // Combine wallet and token ID into watermark message
  const message = `${walletAddress}:${tokenId}`;
  const events = [];

  // In development mode without the C++ binary, return the image as-is
  if (USE_MOCK_WATERMARK) {
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();
    events.push(E.watermarkApplied({ message, method: 'mock' }));
    return [pngBuffer, events];
  }

  // Use API if configured
  if (WATERMARK_API_URL && WATERMARK_API_KEY) {
    const [buffer, apiEvents] = await applyWatermarkViaAPI(imageBuffer, message);
    return [buffer, [...events, ...apiEvents]];
  }

  // Fall back to local binary
  const [buffer, binaryEvents] = await applyWatermarkViaBinary(imageBuffer, message);
  return [buffer, [...events, ...binaryEvents]];
}

/**
 * Apply watermark via cloud API
 * Uses multipart/form-data upload with SSE progress streaming
 */
async function applyWatermarkViaAPI(imageBuffer, message) {
  const events = [];

  // Convert to PNG
  const pngBuffer = await sharp(imageBuffer).png().toBuffer();

  // Create form data using node-fetch compatible approach
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("image", pngBuffer, {
    filename: "image.png",
    contentType: "image/png",
  });
  form.append("message", message);
  form.append("strength", WATERMARK_STRENGTH);

  // Use node-fetch or http request for proper form-data streaming
  const response = await new Promise((resolve, reject) => {
    const url = new URL(`${WATERMARK_API_URL}/watermark`);
    // Honor the URL scheme — the engine may be plain HTTP (e.g. on an internal
    // docker network). Forcing https here caused EPROTO against an http engine.
    const isHttps = url.protocol === "https:";
    const httpLib = require(isHttps ? "https" : "http");

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "X-API-Key": WATERMARK_API_KEY,
        ...form.getHeaders(),
      },
    };

    const req = httpLib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on("error", reject);
    form.pipe(req);
  });

  if (response.status !== 200) {
    throw new Error(`Watermark API error: ${response.status} - ${response.data}`);
  }

  // Parse SSE stream to get the download URL
  const lines = response.data.split("\n");
  let downloadUrl = null;

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.progress) {
          events.push(E.watermarkProgress({ progress: data.progress, percent: data.percent }));
        }
        if (data.complete && data.downloadUrl) {
          downloadUrl = data.downloadUrl;
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  }

  if (!downloadUrl) {
    throw new Error("Watermark API did not return a download URL");
  }

  // Download the watermarked image
  const downloadResponse = await fetch(`${WATERMARK_API_URL}${downloadUrl}`, {
    headers: {
      "X-API-Key": WATERMARK_API_KEY,
    },
  });

  if (!downloadResponse.ok) {
    const error = await downloadResponse.text();
    throw new Error(`Watermark download error: ${downloadResponse.status} - ${error}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  events.push(E.watermarkApplied({ message, method: 'api' }));
  return [Buffer.from(arrayBuffer), events];
}

/**
 * Apply watermark via local Rust binary
 */
async function applyWatermarkViaBinary(imageBuffer, message) {
  const tempId = uuidv4();
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}-input.png`);
  const outputPath = path.join(tempDir, `${tempId}-output.png`);

  try {
    // Convert to PNG (required by watermark binary)
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();

    // Write to temp file
    await fs.writeFile(inputPath, pngBuffer);

    // Run watermark binary
    await runWatermarkBinary(inputPath, outputPath, message);

    // Read result
    const watermarkedBuffer = await fs.readFile(outputPath);
    const events = [E.watermarkApplied({ message, method: 'binary' })];

    return [watermarkedBuffer, events];
  } finally {
    // Cleanup temp files
    await cleanup(inputPath, outputPath);
  }
}

/**
 * Run the Rust watermark binary
 * Usage: embed <INPUT_PATH> <OUTPUT_PATH> <MESSAGE> [--strength <STRENGTH>]
 */
function runWatermarkBinary(inputPath, outputPath, message) {
  return new Promise((resolve, reject) => {
    const args = [
      inputPath,
      outputPath,
      message,
      '--strength', WATERMARK_STRENGTH,
    ];

    const proc = spawn(WATERMARK_BINARY, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      // Log progress updates
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.startsWith("PROGRESS:")) {
          // Progress info captured in stdout; events emitted by caller
        }
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(`Watermark binary exited with code ${code}: ${stderr}`),
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run watermark binary: ${err.message}`));
    });
  });
}

/**
 * Generate a preview/thumbnail image
 * @param {Buffer} imageBuffer - Source image
 * @returns {Promise<Buffer>} - JPEG preview
 */
async function generatePreview(imageBuffer) {
  return sharp(imageBuffer)
    .resize(800, 800, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Cleanup temp files
 */
async function cleanup(...paths) {
  for (const p of paths) {
    try {
      await fs.unlink(p);
    } catch {
      // Ignore cleanup errors
    }
  }
}

module.exports = {
  applyWatermark,
  generatePreview,
};
