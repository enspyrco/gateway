/**
 * auth-context.js — Guard middleware factory.
 *
 * requireAuth(verifier) returns Express middleware that:
 *   1. Decodes the Bearer token
 *   2. Parses the SIWE message
 *   3. Delegates verification to the strategy
 *   4. Normalises the auth context onto req.actor (and backwards-compat fields)
 */

const { SiweMessage } = require('siwe');
const { MockVerifier } = require('./strategies/mock-verifier');
const E = require('../events/types');
const { dispatch } = require('../events/dispatch');

/**
 * Create auth middleware for a given verifier strategy.
 * @param {SIWEVerifier | MockVerifier} verifier
 * @returns {import('express').RequestHandler}
 */
function requireAuth(verifier) {
  return async function authMiddleware(req, res, next) {
    // ── Decode bearer token ────────────────────────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await dispatch([E.authFailed({ reason: 'missing_header', detail: 'Missing or invalid authorization header' })]);
      return res.status(401).json({
        error: 'Missing authorization header',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.split(' ')[1];

    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(token, 'base64').toString());
    } catch (e) {
      await dispatch([E.authFailed({ reason: 'invalid_token', detail: 'Failed to decode token' })]);
      return res.status(401).json({
        error: 'Invalid token format',
        code: 'INVALID_TOKEN',
      });
    }

    const { message, signature } = parsed;

    if (!message || !signature) {
      await dispatch([E.authFailed({ reason: 'invalid_token', detail: 'Missing message or signature' })]);
      return res.status(401).json({
        error: 'Missing message or signature',
        code: 'INVALID_TOKEN',
      });
    }

    // ── Parse SIWE message ─────────────────────────────────────
    let siweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch (e) {
      await dispatch([E.authFailed({ reason: 'invalid_siwe', detail: e.message })]);
      return res.status(401).json({
        error: 'Invalid SIWE message format: ' + e.message,
        code: 'INVALID_TOKEN',
      });
    }

    // ── Delegate to strategy ───────────────────────────────────
    try {
      const { address, chainId } = await verifier.verify(siweMessage, signature);

      // Canonical auth context — req.actor replaces req.wallet
      req.actor = { address: address.toLowerCase(), chainId };
      // Backwards compatibility
      req.wallet = req.actor.address;
      req.chainId = req.actor.chainId;

      await dispatch([E.authVerified({ wallet: req.actor.address, chainId, mock: verifier instanceof MockVerifier })]);
      next();
    } catch (error) {
      await dispatch([E.authFailed({ reason: 'verification_failed', detail: error.message })]);
      return res.status(401).json({ error: error.message, code: 'AUTH_FAILED' });
    }
  };
}

module.exports = { requireAuth };
