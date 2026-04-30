/**
 * auth.js — Authentication middleware factory.
 *
 * Selects the verification strategy at startup (not per-request) based on
 * ALLOW_MOCK_SIGNATURES. Exports ready-to-use Express middleware.
 *
 * Strategy:
 *   ALLOW_MOCK_SIGNATURES=true  → MockVerifier  (test/dev only)
 *   (default)                   → SIWEVerifier  (production)
 */

const { SIWEVerifier } = require('./strategies/siwe-verifier');
const { MockVerifier } = require('./strategies/mock-verifier');
const { requireAuth } = require('./auth-context');

// Strategy selection at startup, not per-request
const ALLOW_MOCK = process.env.ALLOW_MOCK_SIGNATURES === 'true';
const verifier = ALLOW_MOCK
  ? new MockVerifier()
  : new SIWEVerifier({
      domain: process.env.SIWE_DOMAIN || undefined,
    });

module.exports = requireAuth(verifier);
