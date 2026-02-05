const express = require('express');
const router = express.Router();
const {
  getAvailableAccounts,
  createSession,
  getPublicSession,
  deleteSession,
} = require('../services/accounts');
const { requireSession } = require('../middleware/session');

/**
 * GET /api/accounts
 * List all available test accounts
 */
router.get('/', (req, res) => {
  try {
    const accounts = getAvailableAccounts();
    res.json({
      success: true,
      accounts,
    });
  } catch (error) {
    console.error('Error listing accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/accounts/current
 * Get current session's account info
 * Requires X-Session-Id header
 */
router.get('/current', requireSession, (req, res) => {
  try {
    res.json({
      success: true,
      account: {
        address: req.session.address,
        name: req.session.name,
        nickname: req.session.nickname,
      },
    });
  } catch (error) {
    console.error('Error getting current account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/accounts/select
 * Select an account and create a session
 * Body: { address: string }
 * Returns: { sessionId: string, account: object }
 */
router.post('/select', (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required',
      });
    }

    const result = createSession(address);

    res.json({
      success: true,
      sessionId: result.sessionId,
      account: result.account,
    });
  } catch (error) {
    console.error('Error selecting account:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/accounts/disconnect
 * Delete the current session
 * Requires X-Session-Id header
 */
router.post('/disconnect', requireSession, (req, res) => {
  try {
    deleteSession(req.sessionId);
    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
