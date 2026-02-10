/**
 * Detection API routes
 * POST /api/detect/blind - Blind detection (extract watermark without reference)
 *
 * Uses the Rust blind detector to find embedded wallet:tokenId.
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const blockchainService = require('../services/blockchain');

const BLIND_DETECT_BINARY = process.env.BLIND_DETECT_BINARY || './detect';
const USE_MOCK_WATERMARK = process.env.USE_MOCK_WATERMARK === 'true';

function createRouter(upload) {
  const router = express.Router();

  /**
   * POST /api/detect/blind
   *
   * Blind watermark detection - extracts watermark without needing a reference.
   * Uses the Rust blind detector to find embedded wallet:tokenId.
   *
   * Body (multipart/form-data):
   * - image: File (required) - Image to check for watermark
   *
   * Returns:
   * - detected: boolean
   * - tokenId: number (if found)
   * - wallet: string (creator wallet, if found)
   * - confidence: number
   * - message: string (raw watermark message)
   * - token: object (token info from blockchain, if found)
   */
  router.post('/blind', upload.single('image'), async (req, res, next) => {
    const detectId = uuidv4();

    try {
      console.log(`[${detectId}] Starting blind detection for wallet: ${req.wallet}`);

      const imageBuffer = req.file?.buffer;

      if (!imageBuffer) {
        return res.status(400).json({
          error: 'Image file required',
          code: 'MISSING_IMAGE'
        });
      }

      // Run blind detection
      console.log(`[${detectId}] Running blind detection...`);
      const result = await runBlindDetection(detectId, imageBuffer);

      if (!result.detected) {
        console.log(`[${detectId}] No watermark detected`);
        return res.json({
          detected: false,
          message: 'No watermark detected in this image',
          confidence: 0
        });
      }

      // Parse the watermark message (format: "walletAddress:tokenId")
      const [wallet, tokenIdStr] = result.message.split(':');
      const tokenId = parseInt(tokenIdStr, 10);

      if (!wallet || isNaN(tokenId)) {
        console.log(`[${detectId}] Invalid watermark format: ${result.message}`);
        return res.json({
          detected: true,
          message: result.message,
          confidence: result.confidence,
          error: 'Watermark detected but format is invalid'
        });
      }

      // Look up token on blockchain
      let token = null;
      try {
        const tokenData = await blockchainService.getTokenData(tokenId);
        token = {
          tokenId,
          creator: tokenData.creator,
          currentOwner: tokenData.currentOwner,
          copyrightOwner: tokenData.copyrightOwner,
          licenseType: ['display', 'commercial', 'transfer'][tokenData.ownerLicense] || 'unknown'
        };
      } catch (e) {
        console.log(`[${detectId}] Token ${tokenId} not found on blockchain`);
      }

      console.log(`[${detectId}] Blind detection complete: wallet=${wallet}, tokenId=${tokenId}`);

      res.json({
        detected: true,
        tokenId,
        wallet,
        confidence: result.confidence,
        message: result.message,
        sequencesDecoded: result.sequencesDecoded,
        token
      });

    } catch (error) {
      console.error(`[${detectId}] Blind detection failed:`, error);
      next(error);
    }
  });

  return router;
}

/**
 * Run the Rust blind detection binary
 */
async function runBlindDetection(detectId, imageBuffer) {
  // Mock mode for development
  if (USE_MOCK_WATERMARK) {
    console.log(`[${detectId}] MOCK: Blind detection - simulating no watermark found`);
    return {
      detected: false,
      message: '',
      confidence: 0,
      sequencesDecoded: 0
    };
  }

  const tempDir = os.tmpdir();
  const imagePath = path.join(tempDir, `${detectId}-blind.png`);

  try {
    // Write image to temp file
    await fs.writeFile(imagePath, imageBuffer);

    // Run Rust blind detection binary
    const output = await new Promise((resolve, reject) => {
      const proc = spawn(BLIND_DETECT_BINARY, [imagePath]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        // Exit code 0 = watermark found, 1 = not found
        resolve({ code, stdout, stderr });
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run blind detection binary: ${err.message}`));
      });
    });

    // Parse output
    const lines = output.stdout.split('\n');
    let detected = output.code === 0;
    let message = '';
    let confidence = 0;
    let sequencesDecoded = 0;

    for (const line of lines) {
      if (line.startsWith('Message: ')) {
        // Extract message between quotes
        const match = line.match(/Message: "(.+)"/);
        if (match) message = match[1];
      } else if (line.startsWith('Minimum confidence:')) {
        const match = line.match(/Minimum confidence: ([\d.]+)/);
        if (match) confidence = parseFloat(match[1]);
      } else if (line.startsWith('Sequences decoded:')) {
        const match = line.match(/Sequences decoded: (\d+)/);
        if (match) sequencesDecoded = parseInt(match[1], 10);
      }
    }

    return { detected, message, confidence, sequencesDecoded };

  } finally {
    // Cleanup
    try {
      await fs.unlink(imagePath);
    } catch {
      // Ignore
    }
  }
}

module.exports = createRouter;
