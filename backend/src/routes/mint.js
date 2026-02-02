/**
 * Mint API routes
 * POST /api/mint - Watermark, encrypt, upload, mint NFT
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const watermarkService = require('../services/watermark');
const encryptionService = require('../services/encryption');
const ipfsService = require('../services/ipfs');
const arweaveService = require('../services/arweave');
const storageService = require('../services/storage');
const blockchainService = require('../services/blockchain');
const firestoreService = require('../services/firestore');

/**
 * Simple mutex for serializing mint operations
 * Ensures token ID prediction is accurate by preventing concurrent mints
 */
class MintMutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}

const mintMutex = new MintMutex();


function createRouter(upload) {
  const router = express.Router();

  /**
   * POST /api/mint
   *
   * Body (multipart/form-data):
   * - image: File (required)
   * - name: string (required)
   * - description: string (optional)
   *
   * Returns:
   * - tokenId: number
   * - transactionHash: string
   * - encryptedBlobUri: string
   * - previewUri: string
   * - metadataUri: string
   */
  router.post('/', upload.single('image'), async (req, res, next) => {
    const mintId = uuidv4();

    try {
      console.log(`[${mintId}] Starting mint for wallet: ${req.wallet}`);

      // Validate request
      const { name, description, licenseType, licenseSignature } = req.body;
      const imageBuffer = req.file?.buffer;

      if (!imageBuffer) {
        return res.status(400).json({
          error: 'Image file required',
          code: 'MISSING_IMAGE'
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

      // Acquire mutex to prevent race conditions in token ID prediction
      // This ensures only one mint can predict + mint at a time
      console.log(`[${mintId}] Waiting for mint lock...`);
      await mintMutex.acquire();
      console.log(`[${mintId}] Acquired mint lock`);

      // All mint variables declared here so they're accessible after try/finally
      let expectedTokenId, tokenId, transactionHash, watermarkId, imageHash;
      let keyId, storagePath, previewUri, watermarkedStoragePath, metadataUri, licenseHash;

      try {
        // Step 1: Predict token ID (need ID before minting for watermark)
        // Token IDs are sequential, so next ID = currentSupply
        const currentSupply = await blockchainService.totalSupply();
        expectedTokenId = currentSupply;
        console.log(`[${mintId}] Predicted token ID: ${expectedTokenId}`);

      // Step 2: Apply watermark with wallet + predicted tokenId
      console.log(`[${mintId}] Applying watermark...`);
      watermarkId = `${req.wallet}:${expectedTokenId}`;
      const watermarkedBuffer = await watermarkService.applyWatermark(
        imageBuffer,
        req.wallet,
        expectedTokenId
      );

      // Step 3: Calculate image hash of watermarked image (for integrity verification)
      imageHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex');

      // Step 4: Generate preview from watermarked image
      console.log(`[${mintId}] Generating preview...`);
      const previewBuffer = await watermarkService.generatePreview(watermarkedBuffer);

      // Step 5: Encrypt original and upload
      console.log(`[${mintId}] Encrypting original...`);
      const encryptResult = await encryptionService.encrypt(
        watermarkedBuffer,
        mintId
      );
      const encryptedBuffer = encryptResult.encryptedBuffer;
      keyId = encryptResult.keyId;

      // Preview goes to IPFS (public)
      // Encrypted original goes to Firebase Storage (for watermark detection)
      // Watermarked image goes to Firebase Storage (backup in case IPFS fails)
      console.log(`[${mintId}] Uploading to IPFS and Firebase Storage...`);
      [storagePath, previewUri, watermarkedStoragePath] = await Promise.all([
        storageService.uploadEncrypted(encryptedBuffer, mintId),
        ipfsService.upload(previewBuffer, `${mintId}-preview.jpg`),
        storageService.uploadWatermarked(watermarkedBuffer, mintId)
      ]);
      console.log(`[${mintId}] Watermarked image backed up to Firebase Storage: ${watermarkedStoragePath}`);

      // Step 6: Generate license hash
      licenseHash = null;
      if (licenseType) {
        const licenseText = generateLicenseTemplate(licenseType);
        const licenseData = `${licenseText}|${licenseSignature || ''}|${req.wallet}|${mintId}`;
        licenseHash = crypto.createHash('sha256').update(licenseData).digest('hex');
        console.log(`[${mintId}] Generated license hash for ${licenseType} license`);
      }

      // Step 7: Create and upload metadata to Arweave (permanent storage)
      // Note: encrypted_original is NOT in metadata - it's private in Firebase Storage
      console.log(`[${mintId}] Creating metadata...`);
      const metadata = {
        name,
        description: description || '',
        image: previewUri,
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
      };

      console.log(`[${mintId}] Uploading metadata to Arweave...`);
      const { txId: metadataTxId } = await arweaveService.uploadJson(metadata, {
        'Token-ID': String(expectedTokenId),
        'Creator': req.wallet,
        'Content-Type': 'application/json'
      });
      metadataUri = `ar://${metadataTxId}`;

      // Step 8: Mint NFT on-chain
      // Note: storagePath is stored on-chain as reference to encrypted original
      // Actual access is controlled by our service + key server
      console.log(`[${mintId}] Minting NFT...`);
      const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
      const licenseTypeNum = licenseType ? licenseTypeMap[licenseType] : 0;
      const mintResult = await blockchainService.mint(
        req.wallet,
        metadataUri,
        licenseTypeNum,
        `0x${imageHash}`,
        licenseHash ? `0x${licenseHash}` : '0x' + '0'.repeat(64),
        storagePath
      );
      tokenId = mintResult.tokenId;
      transactionHash = mintResult.transactionHash;

      // Verify we got the expected token ID
      if (tokenId !== expectedTokenId) {
        // This should never happen with the mutex in place
        console.error(`[${mintId}] Token ID mismatch! Expected ${expectedTokenId}, got ${tokenId}. This indicates a bug.`);
      }

      } finally {
        // Always release the mutex
        mintMutex.release();
        console.log(`[${mintId}] Released mint lock`);
      }

      // Step 9: Store in Firestore
      console.log(`[${mintId}] Storing in Firestore...`);
      await firestoreService.createToken({
        tokenId,
        mintId,
        wallet: req.wallet,
        name,
        description,
        imageHash,
        watermarkId,
        keyId,
        storagePath,  // Firebase Storage path for encrypted original
        watermarkedStoragePath,  // Firebase Storage backup of watermarked image
        previewUri,
        metadataUri,
        transactionHash,
        licenseType: licenseType || null,
        licenseHash: licenseHash || null,
        createdAt: new Date()
      });

      console.log(`[${mintId}] Mint complete! Token ID: ${tokenId}`);

      res.status(201).json({
        success: true,
        tokenId,
        transactionHash,
        watermarkId,
        storagePath,  // Firebase Storage path (access controlled by service)
        previewUri,
        metadataUri,
        imageHash,
        ...(licenseHash ? { licenseHash } : {})
      });

    } catch (error) {
      console.error(`[${mintId}] Mint failed:`, error);
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

    const licenseText = generateLicenseTemplate(type);
    res.json({ licenseType: type, text: licenseText });
  });

  return router;
}

/**
 * Generate license template (without specific details)
 */
function generateLicenseTemplate(type) {
  const templates = {
    display: `
NFTMARKET LICENSE AGREEMENT - DISPLAY

This license grants personal, non-commercial display rights only.

You MAY:
- Display the artwork for personal enjoyment
- Resell or transfer the NFT

You MAY NOT:
- Use the artwork commercially
- Create derivative works
- Sublicense the artwork

Copyright remains with the creator.
    `.trim(),

    commercial: `
NFTMARKET LICENSE AGREEMENT - COMMERCIAL

This license grants commercial usage rights.

You MAY:
- Display the artwork publicly or privately
- Use the artwork in commercial projects
- Create and sell merchandise
- Create derivative works
- Resell or transfer the NFT (license transfers with it)

You MAY NOT:
- Claim original authorship
- Sublicense independently of the NFT

Copyright remains with the creator. Commercial rights transfer with the NFT.
    `.trim(),

    transfer: `
NFTMARKET LICENSE AGREEMENT - COPYRIGHT TRANSFER

This agreement transfers full copyright ownership to you.

You receive:
- Full copyright ownership
- All reproduction rights
- All derivative work rights
- All commercial rights
- Right to sublicense

The creator retains:
- Moral rights (where applicable by law)
- Right to be credited as original author

This is a complete and irrevocable transfer of copyright.
    `.trim()
  };

  return templates[type];
}

module.exports = createRouter;
