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
const blockchainService = require('../services/blockchain');
const perceptualService = require('../services/perceptual');

// Note: Token ID reservation is now handled by the smart contract
// The old mutex approach was flawed - it only protected this single backend instance
// The contract's reserveTokenId() guarantees the token ID atomically on-chain


function createRouter(upload) {
  const router = express.Router();

  /**
   * POST /api/mint
   *
   * Body (multipart/form-data):
   * - image: File (required)
   * - name: string (required)
   * - description: string (optional)
   * - licenseType: 'display' | 'commercial' | 'transfer' (optional)
   *
   * Returns:
   * - tokenId: number
   * - transactionHash: string
   * - ipfsUri: string (IPFS URI for watermarked image)
   * - metadataUri: string (Arweave URI for metadata)
   * - imageHash: string (SHA-256 of watermarked image)
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

      // All mint variables declared here
      let reservedTokenId, tokenId, transactionHash, watermarkId, imageHash;
      let ipfsUri, metadataUri, licenseHash;

      // Step 1: Reserve token ID on-chain (guarantees this ID is ours)
      // This is atomic - no one else can get this ID
      console.log(`[${mintId}] Reserving token ID on-chain...`);
      const reservation = await blockchainService.reserveTokenId();
      reservedTokenId = reservation.tokenId;
      console.log(`[${mintId}] Reserved token ID: ${reservedTokenId} (expires: ${new Date(reservation.expiry * 1000).toISOString()})`);

      // Step 2: Apply watermark with wallet + reserved tokenId
      console.log(`[${mintId}] Applying watermark...`);
      watermarkId = `${req.wallet}:${reservedTokenId}`;
      const watermarkedBuffer = await watermarkService.applyWatermark(
        imageBuffer,
        req.wallet,
        reservedTokenId
      );

      // Step 3: Calculate image hash of watermarked image (for integrity verification)
      imageHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex');

      // Step 4: Upload watermarked image to IPFS
      console.log(`[${mintId}] Uploading to IPFS...`);
      ipfsUri = await ipfsService.upload(watermarkedBuffer, `${mintId}-watermarked.png`);
      console.log(`[${mintId}] Watermarked image uploaded to IPFS: ${ipfsUri}`);

      // Step 5: Generate license hash
      licenseHash = null;
      if (licenseType) {
        const licenseText = generateLicenseTemplate(licenseType);
        const licenseData = `${licenseText}|${licenseSignature || ''}|${req.wallet}|${mintId}`;
        licenseHash = crypto.createHash('sha256').update(licenseData).digest('hex');
        console.log(`[${mintId}] Generated license hash for ${licenseType} license`);
      }

      // Step 6: Create and upload metadata to Arweave (permanent storage)
      console.log(`[${mintId}] Creating metadata...`);
      const metadata = {
        name,
        description: description || '',
        image: ipfsUri,  // Full watermarked image on IPFS
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
        'Token-ID': String(reservedTokenId),
        'Creator': req.wallet,
        'Content-Type': 'application/json'
      });
      metadataUri = `ar://${metadataTxId}`;

      // Step 7: Mint NFT on-chain with reserved token ID
      console.log(`[${mintId}] Minting NFT with reserved token ID ${reservedTokenId}...`);
      const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
      const licenseTypeNum = licenseType ? licenseTypeMap[licenseType] : 0;
      const mintResult = await blockchainService.mint(
        reservedTokenId,
        req.wallet,
        metadataUri,
        licenseTypeNum,
        `0x${imageHash}`,
        licenseHash ? `0x${licenseHash}` : '0x' + '0'.repeat(64),
        ipfsUri
      );
      tokenId = mintResult.tokenId;
      transactionHash = mintResult.transactionHash;

      // Step 8: Register perceptual hashes for infringement detection
      // This allows matching even when watermark doesn't survive (print-camera)
      console.log(`[${mintId}] Registering perceptual hashes...`);
      try {
        await perceptualService.register(String(tokenId), watermarkedBuffer, {
          wallet: req.wallet,
          name,
          imageHash,
        });
      } catch (perceptualError) {
        // Non-fatal - log but don't fail the mint
        console.warn(`[${mintId}] Perceptual registration failed (non-fatal):`, perceptualError.message);
      }

      console.log(`[${mintId}] Mint complete! Token ID: ${tokenId}`);

      res.status(201).json({
        success: true,
        tokenId,
        transactionHash,
        watermarkId,
        ipfsUri,      // IPFS URI for watermarked image (public)
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
