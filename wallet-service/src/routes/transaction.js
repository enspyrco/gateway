const express = require('express');
const router = express.Router();
const { sendTransaction, getBalance, getNonce } = require('../services/blockchain');
const { requireSession } = require('../middleware/session');

/**
 * POST /api/transaction/send
 * Sign and send a transaction to the blockchain
 * Body: { to: string, data: string, value?: string }
 * Returns: { hash: string, blockNumber: number, gasUsed: string, status: string }
 */
router.post('/send', requireSession, async (req, res) => {
  try {
    const { to, data, value = '0' } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Recipient address (to) is required',
      });
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Transaction data is required',
      });
    }

    console.log(`Sending transaction from ${req.session.address} to ${to}`);
    console.log(`Data: ${data.substring(0, 66)}...`);
    console.log(`Value: ${value} wei`);

    const result = await sendTransaction(
      req.session.privateKey,
      to,
      data,
      value
    );

    console.log(`Transaction successful: ${result.hash}`);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error sending transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/transaction/balance
 * Get current account balance
 * Returns: { balance: string (wei), balanceEth: string }
 */
router.get('/balance', requireSession, async (req, res) => {
  try {
    const balance = await getBalance(req.session.address);
    const balanceEth = (BigInt(balance) / BigInt(10 ** 18)).toString();

    res.json({
      success: true,
      address: req.session.address,
      balance,
      balanceEth,
    });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/transaction/nonce
 * Get current account nonce
 * Returns: { nonce: number }
 */
router.get('/nonce', requireSession, async (req, res) => {
  try {
    const nonce = await getNonce(req.session.address);

    res.json({
      success: true,
      address: req.session.address,
      nonce,
    });
  } catch (error) {
    console.error('Error getting nonce:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
