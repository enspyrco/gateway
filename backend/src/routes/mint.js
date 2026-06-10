/**
 * Mint API routes
 * POST /api/mint - Watermark, upload to IPFS, mint NFT
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const watermarkService = require('../services/watermark');
const ipfsService = require('../services/ipfs');
const arweaveService = require('../services/arweave');
const { stampSchemaVersion } = arweaveService;
const blockchainService = require('../services/blockchain');
const perceptualService = require('../services/perceptual');
const E = require('../events/types');
const { dispatch } = require('../events/dispatch');
const { unit, bind, tell } = require('../utils/writer');
const { getLicenseTemplate } = require('../utils/license-utils');
const { getCachedResult, cacheResult, isInProgress, markInProgress, clearInProgress } = require('../commands/mint-command');


function createRouter(upload) {
  const router = express.Router();

  // Per-route rate limiter for mint endpoint (stricter than global)
  let mintLimiter;
  if (process.env.NODE_ENV === 'test') {
    mintLimiter = (req, res, next) => next();
  } else {
    const rateLimit = require('express-rate-limit');
    mintLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: 'Too many mint attempts', code: 'RATE_LIMITED' }
    });
  }

  /**
   * POST /api/mint
   *
   * Body (multipart/form-data):
   * - image: File (required)
   * - name: string (required)
   * - description: string (optional)
   * - licenseType: 'display' | 'commercial' | 'transfer' (optional)
   * - mintId: string (optional idempotency key — if provided, duplicate
   *   submissions return the cached result instead of minting twice)
   *
   * Returns:
   * - tokenId: number
   * - transactionHash: string
   * - ipfsUri: string (IPFS URI for watermarked image)
   * - metadataUri: string (Arweave URI for metadata)
   * - imageHash: string (SHA-256 of watermarked image)
   */
  router.post('/', mintLimiter, upload.single('image'), async (req, res, next) => {
    const mintId = req.body.mintId || uuidv4();

    // Idempotency: if this mintId was already processed, return cached result
    const cached = getCachedResult(mintId);
    if (cached) {
      return res.status(200).json(cached);
    }
    if (isInProgress(mintId)) {
      return res.status(409).json({
        error: 'Mint already in progress for this mintId',
        code: 'MINT_IN_PROGRESS',
        mintId
      });
    }
    markInProgress(mintId);
    // Writer accumulator — starts with the mint.started event
    let w = unit(null);
    w = tell(w, E.mintStarted({ mintId, wallet: req.wallet }));

    try {
      // Validate request
      const { name, description, licenseType, licenseSignature } = req.body;
      const imageBuffer = req.file?.buffer;

      if (!imageBuffer) {
        return res.status(400).json({
          error: 'Image file required',
          code: 'MISSING_IMAGE'
        });
      }

      // Magic-byte validation — reject files whose content doesn't match a supported image type
      const SIGNATURES = [
        [0x89, 0x50, 0x4e, 0x47],          // PNG
        [0xff, 0xd8, 0xff],                 // JPEG
        [0x47, 0x49, 0x46],                 // GIF
      ];
      // WebP: the RIFF header alone is ambiguous (WAV/AVI share it) —
      // also require bytes 8-11 to spell "WEBP".
      const isWebP =
        imageBuffer.length >= 12 &&
        [0x52, 0x49, 0x46, 0x46].every((byte, i) => imageBuffer[i] === byte) &&
        imageBuffer.slice(8, 12).toString('ascii') === 'WEBP';
      const matchesMagic = isWebP || SIGNATURES.some(sig =>
        sig.every((byte, i) => imageBuffer[i] === byte)
      );
      if (!matchesMagic) {
        return res.status(400).json({
          error: 'File content does not match a supported image type',
          code: 'INVALID_FILE'
        });
      }

      if (!name) {
        return res.status(400).json({
          error: 'Missing required field: name',
          code: 'MISSING_FIELDS'
        });
      }

      // Validate license type
      const validLicenseTypes = ['display', 'commercial', 'transfer'];
      if (licenseType && !validLicenseTypes.includes(licenseType)) {
        return res.status(400).json({
          error: 'Invalid license type. Must be: display, commercial, or transfer',
          code: 'INVALID_LICENSE_TYPE'
        });
      }

      // Step 1: Reserve token ID on-chain (guarantees this ID is ours)
      w = tell(w, E.mintStep({ mintId, step: 'reserve', detail: 'Reserving token ID on-chain' }));
      w = await bind(w, () => blockchainService.reserveTokenId());
      const reservedTokenId = w[0].tokenId;

      // Step 2: Apply watermark with wallet + reserved tokenId
      w = tell(w, E.mintStep({ mintId, step: 'watermark', detail: `Applying watermark for token ${reservedTokenId}` }));
      const watermarkId = `${req.wallet}:${reservedTokenId}`;
      w = await bind(w, () => watermarkService.applyWatermark(imageBuffer, req.wallet, reservedTokenId));
      const watermarkedBuffer = w[0];

      // Step 3: Calculate image hash of watermarked image (for integrity verification)
      const imageHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex');

      // Step 4: Upload watermarked image to IPFS
      w = tell(w, E.mintStep({ mintId, step: 'ipfs', detail: 'Uploading to IPFS' }));
      w = await bind(w, () => ipfsService.upload(watermarkedBuffer, `${mintId}-watermarked.png`));
      const ipfsUri = w[0];

      // Step 5: Generate license hash
      let licenseHash = null;
      if (licenseType) {
        const licenseText = getLicenseTemplate(licenseType);
        const licenseData = `${licenseText}|${licenseSignature || ''}|${req.wallet}|${mintId}`;
        licenseHash = crypto.createHash('sha256').update(licenseData).digest('hex');
        w = tell(w, E.mintStep({ mintId, step: 'license_hash', detail: `Generated ${licenseType} license hash` }));
      }

      // Step 6: Create and upload metadata to Arweave (permanent storage)
      w = tell(w, E.mintStep({ mintId, step: 'metadata', detail: 'Uploading metadata to Arweave' }));
      const metadata = stampSchemaVersion({
        name,
        description: description || '',
        image: ipfsUri,
        attributes: [
          { trait_type: 'Watermark ID', value: watermarkId },
          { trait_type: 'Creator', value: req.wallet },
          ...(licenseType ? [{ trait_type: 'License Type', value: licenseType }] : [])
        ],
        properties: {
          image_hash: imageHash,
          watermark_id: watermarkId,
          created_at: new Date().toISOString(),
          ...(licenseHash ? { license_hash: licenseHash, license_type: licenseType } : {})
        }
      });

      w = await bind(w, () => arweaveService.uploadJson(metadata, {
        'Token-ID': String(reservedTokenId),
        'Creator': req.wallet,
        'Content-Type': 'application/json'
      }));
      const metadataUri = `ar://${w[0].txId}`;

      // Step 7: Mint NFT on-chain with reserved token ID
      // Contract signature: mint(reservedTokenId, to, uri, imageHash, ipfsUri)
      // Creator always receives Transfer (full) rights on-chain.
      // License type is stored in Arweave metadata (step 6), not on-chain at mint time.
      w = tell(w, E.mintStep({ mintId, step: 'mint', detail: `Minting NFT with token ID ${reservedTokenId}` }));
      w = await bind(w, () => blockchainService.mint(
        reservedTokenId, req.wallet, metadataUri, `0x${imageHash}`, ipfsUri
      ));
      const { tokenId, transactionHash } = w[0];

      // Step 8: Register perceptual hashes for infringement detection
      w = tell(w, E.mintStep({ mintId, step: 'perceptual', detail: 'Registering perceptual hashes' }));
      try {
        await perceptualService.register(String(tokenId), watermarkedBuffer, {
          wallet: req.wallet, name, imageHash,
        });
      } catch (perceptualError) {
        // Non-fatal — emit event but don't fail the mint
        w = tell(w, E.mintStep({ mintId, step: 'perceptual_warning', detail: `Perceptual registration failed (non-fatal): ${perceptualError.message}` }));
      }

      w = tell(w, E.mintCompleted({ mintId, tokenId, transactionHash }));

      // Dispatch all collected events to registered sinks
      await dispatch(w[1]);

      const result = {
        success: true,
        mintId,
        tokenId,
        transactionHash,
        watermarkId,
        ipfsUri,
        metadataUri,
        imageHash,
        ...(licenseHash ? { licenseHash } : {})
      };

      // Cache for idempotency
      cacheResult(mintId, result);

      res.status(201).json(result);

    } catch (error) {
      clearInProgress(mintId);
      w = tell(w, E.mintFailed({ mintId, error: error.message }));
      await dispatch(w[1]);
      next(error);
    }
  });

  /**
   * GET /api/mint/license/:type
   * Returns license agreement text for signing (used when listing for sale)
   */
  router.get('/license/:type', (req, res) => {
    const { type } = req.params;
    const validTypes = ['display', 'commercial', 'transfer'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid license type',
        code: 'INVALID_LICENSE_TYPE'
      });
    }

    const licenseText = getLicenseTemplate(type);
    res.json({ licenseType: type, text: licenseText });
  });

  return router;
}

module.exports = createRouter;
