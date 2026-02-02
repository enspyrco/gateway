const express = require('express');
const router = express.Router();
const { signMessage, signTypedData, signHash } = require('../services/signer');
const { requireSession } = require('../middleware/session');

/**
 * POST /api/sign/message
 * Sign an arbitrary message (personal_sign / EIP-191)
 * Body: { message: string }
 * Returns: { signature: string }
 */
router.post('/message', requireSession, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    const signature = await signMessage(req.session.privateKey, message);

    res.json({
      success: true,
      signature,
      address: req.session.address,
    });
  } catch (error) {
    console.error('Error signing message:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/sign/typed-data
 * Sign EIP-712 typed data
 * Body: { domain: object, types: object, primaryType: string, message: object }
 * Returns: { signature: string }
 */
router.post('/typed-data', requireSession, async (req, res) => {
  try {
    const { domain, types, primaryType, message } = req.body;

    if (!domain || !types || !message) {
      return res.status(400).json({
        success: false,
        error: 'domain, types, and message are required',
      });
    }

    // Build types object with primary type
    const typesCopy = { ...types };

    const signature = await signTypedData(
      req.session.privateKey,
      domain,
      typesCopy,
      message
    );

    res.json({
      success: true,
      signature,
      address: req.session.address,
    });
  } catch (error) {
    console.error('Error signing typed data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/sign/hash
 * Sign a raw hash (32 bytes)
 * Body: { hash: string (hex) }
 * Returns: { signature: string }
 */
router.post('/hash', requireSession, async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash) {
      return res.status(400).json({
        success: false,
        error: 'Hash is required',
      });
    }

    const signature = signHash(req.session.privateKey, hash);

    res.json({
      success: true,
      signature,
      address: req.session.address,
    });
  } catch (error) {
    console.error('Error signing hash:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
