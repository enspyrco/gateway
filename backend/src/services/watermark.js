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

const WATERMARK_API_URL = process.env.WATERMARK_API_URL;
const WATERMARK_API_KEY = process.env.WATERMARK_API_KEY;
const WATERMARK_BINARY = process.env.WATERMARK_BINARY || "./mark-image";
const WATERMARK_STRENGTH = process.env.WATERMARK_STRENGTH || "1.0";
const USE_MOCK_WATERMARK = process.env.USE_MOCK_WATERMARK === "true";

/**
 * Apply invisible watermark to image
 * @param {Buffer} imageBuffer - Original image
 * @param {string} message - Message to embed (e.g., "TIND12345678")
 * @returns {Promise<Buffer>} - Watermarked image
 */
async function applyWatermark(imageBuffer, message) {
  // In development mode without the C++ binary, return the image as-is
  if (USE_MOCK_WATERMARK) {
    console.log(`MOCK WATERMARK: Would embed message "${message}" into image`);
    // Just convert to PNG and return (simulating watermark process)
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();
    return pngBuffer;
  }

  // Use API if configured
  if (WATERMARK_API_URL && WATERMARK_API_KEY) {
    return applyWatermarkViaAPI(imageBuffer, message);
  }

  // Fall back to local binary
  return applyWatermarkViaBinary(imageBuffer, message);
}

/**
 * Apply watermark via cloud API
 * Uses multipart/form-data upload with SSE progress streaming
 */
async function applyWatermarkViaAPI(imageBuffer, message) {
  console.log(`Calling watermark API for message "${message}"`);

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
    const https = require("https");
    const url = new URL(`${WATERMARK_API_URL}/watermark`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "X-API-Key": WATERMARK_API_KEY,
        ...form.getHeaders(),
      },
    };

    const req = https.request(options, (res) => {
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
          console.log(`Watermark progress: ${data.progress} (${data.percent}%)`);
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
  console.log(`Downloading watermarked image from ${downloadUrl}`);
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
  return Buffer.from(arrayBuffer);
}

/**
 * Apply watermark via local C++ binary
 */
async function applyWatermarkViaBinary(imageBuffer, message) {
  const tempId = uuidv4();
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}-input.png`);
  const outputPath = path.join(tempDir, `${tempId}-input-marked.png`);

  try {
    // Convert to PNG (required by watermark binary)
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();

    // Write to temp file
    await fs.writeFile(inputPath, pngBuffer);

    // Run watermark binary
    await runWatermarkBinary(inputPath, message);

    // Read result
    const watermarkedBuffer = await fs.readFile(outputPath);

    return watermarkedBuffer;
  } finally {
    // Cleanup temp files
    await cleanup(inputPath, outputPath);
  }
}

/**
 * Run the C++ watermark binary
 */
function runWatermarkBinary(filePath, message) {
  return new Promise((resolve, reject) => {
    const args = [
      filePath,
      path.basename(filePath),
      message,
      WATERMARK_STRENGTH,
    ];

    console.log(`Running: ${WATERMARK_BINARY} ${args.join(" ")}`);

    const proc = spawn(WATERMARK_BINARY, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      // Log progress updates
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.startsWith("PROGRESS:")) {
          console.log(`Watermark: ${line.replace("PROGRESS:", "")}`);
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
