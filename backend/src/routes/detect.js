/**
 * Detection API routes
 * POST /api/detect/blind     - Blind detection on an uploaded image (auth required)
 * GET  /api/detect/token/:id - Blind detection on a minted token's stored image (public)
 *
 * Uses the blind detector to find the embedded wallet:tokenId.
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const blockchainService = require('../services/blockchain');
const tokenRepository = require('../services/token-repository');
const ipfsService = require('../services/ipfs');
const E = require('../events/types');
const { dispatch } = require('../events/dispatch');

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
    const allEvents = [];

    try {
      allEvents.push(E.detectStarted({ detectId, wallet: req.wallet }));

      const imageBuffer = req.file?.buffer;

      if (!imageBuffer) {
        return res.status(400).json({
          error: 'Image file required',
          code: 'MISSING_IMAGE'
        });
      }

      // Run blind detection
      const result = await runBlindDetection(detectId, imageBuffer);

      if (!result.detected) {
        allEvents.push(E.detectCompleted({ detectId, detected: false }));
        await dispatch(allEvents);
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
        allEvents.push(E.detectCompleted({ detectId, detected: true }));
        await dispatch(allEvents);
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
        // Token not found on blockchain — not an error, just no match
      }

      allEvents.push(E.detectCompleted({ detectId, detected: true, tokenId, wallet }));
      await dispatch(allEvents);

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
      allEvents.push(E.detectFailed({ detectId, error: error.message }));
      await dispatch(allEvents);
      next(error);
    }
  });

  return router;
}

// ── Public per-token decode ────────────────────────────────────────────────
// The server already holds every token's watermarked image, so it can decode
// its own store without accepting uploads. Results are immutable per stored
// image, so they're cached forever; decodes are CPU-heavy (~8s, up to ~60s on
// a miss), so they run strictly one at a time.

const tokenDecodeCache = new Map(); // tokenId -> Promise<result>
let decodeQueue = Promise.resolve(); // global serializer for the C++ detector

async function decodeTokenImage(tokenId) {
  const detectId = `token-${tokenId}`;
  const allEvents = [E.detectStarted({ detectId })];

  const token = await tokenRepository.getTokenData(tokenId);
  if (!token.ipfsUri) {
    throw Object.assign(new Error('Token has no stored image'), { status: 404 });
  }

  const imageBuffer = await ipfsService.fetch(token.ipfsUri);
  const result = await runBlindDetection(detectId, imageBuffer);

  // The engine null-pads short messages to a fixed length; strip for compare.
  const message = (result.message || '').replace(/[\u0000\s]+$/, "");
  const expected = `${(token.creator || '').toLowerCase()}:${tokenId}`;
  const verified = result.detected && message.toLowerCase() === expected;

  allEvents.push(E.detectCompleted({ detectId, detected: result.detected, tokenId }));
  await dispatch(allEvents);

  return {
    tokenId,
    detected: result.detected,
    message,
    confidence: result.confidence,
    sequencesDecoded: result.sequencesDecoded,
    verified,
    creator: token.creator,
  };
}

function createPublicRouter() {
  const router = express.Router();

  /**
   * GET /api/detect/token/:tokenId
   *
   * Blind-decode the watermark from a minted token's stored image. Public:
   * it only ever reads images the platform already serves at /ipfs/:hash.
   *
   * Returns:
   * - detected: boolean
   * - message: string (decoded watermark, null-padding stripped)
   * - confidence: number (peak/RMS of the weakest decoded sequence)
   * - verified: boolean (message matches the on-chain creator:tokenId)
   * - cached: boolean
   */
  router.get('/:tokenId', async (req, res, next) => {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (!Number.isInteger(tokenId) || tokenId < 0 || String(tokenId) !== req.params.tokenId) {
      return res.status(400).json({ error: 'Invalid token id', code: 'INVALID_TOKEN_ID' });
    }

    const cached = tokenDecodeCache.has(tokenId);
    if (!cached) {
      // Single-flight per token, serialized globally. The queue link swallows
      // upstream errors so one failed decode can't poison the chain.
      const run = (decodeQueue = decodeQueue
        .catch(() => {})
        .then(() => decodeTokenImage(tokenId)));
      tokenDecodeCache.set(tokenId, run);
      // A failure (missing token, detector error) shouldn't be cached forever.
      run.catch(() => tokenDecodeCache.delete(tokenId));
    }

    try {
      const result = await tokenDecodeCache.get(tokenId);
      res.json({ ...result, cached });
    } catch (error) {
      if (/does not exist|not found/i.test(error.message)) {
        return res.status(404).json({ error: 'Token not found', code: 'TOKEN_NOT_FOUND' });
      }
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
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
module.exports.createPublicRouter = createPublicRouter;
