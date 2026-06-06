const express = require('express');
const router = express.Router();
const { SiweMessage } = require('siwe');
const { signMessage } = require('../services/signer');
const { requireSession } = require('../middleware/session');

/**
 * Generate a random alphanumeric nonce (16 characters)
 */
function generateNonce() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let nonce = '';
  for (let i = 0; i < 16; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

/**
 * POST /api/auth/token
 * Generate a SIWE auth token for the backend
 * Returns: { token: string (base64), expiresAt: string }
 */
router.post('/token', requireSession, async (req, res) => {
  try {
    const chainId = parseInt(process.env.CHAIN_ID || '31337');
    const now = new Date();
    const expiry = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12h (backend caps at 24h)

    // Build SIWE message. Domain/URI must match what the backend's verifier
    // enforces (SIWE_DOMAIN), so these are env-driven for non-localhost deploys.
    const siweMessage = new SiweMessage({
      domain: process.env.SIWE_DOMAIN || 'localhost',
      address: req.session.address,
      statement: 'Sign in to NFTmarket',
      uri: process.env.SIWE_URI || 'http://localhost:3000',
      version: '1',
      chainId,
      nonce: generateNonce(),
      issuedAt: now.toISOString(),
      expirationTime: expiry.toISOString(),
    });

    const message = siweMessage.prepareMessage();

    // Sign the message
    const signature = await signMessage(req.session.privateKey, message);

    // Create token (base64 encoded JSON)
    const tokenData = {
      message,
      signature,
    };
    const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    res.json({
      success: true,
      token,
      address: req.session.address,
      expiresAt: expiry.toISOString(),
    });
  } catch (error) {
    console.error('Error generating auth token:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
