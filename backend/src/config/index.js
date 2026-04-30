/**
 * Configuration Facade
 *
 * Validates all security-sensitive environment variables at startup.
 * Services import from here instead of reading process.env directly.
 * Fail-fast: throws on missing or invalid values in production.
 */

const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

/**
 * Require an environment variable. Throws at startup if missing.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get an env var with a default value.
 */
function envOrDefault(name, defaultValue) {
  return process.env[name] || defaultValue;
}

// ── CORS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [/^http:\/\/localhost(:\d+)?$/];

// ── Watermark Binary ──────────────────────────────────────────
const WATERMARK_BINARY = process.env.WATERMARK_BINARY || './mark-image';
// Validate the binary path is not suspicious
if (isProduction && WATERMARK_BINARY.includes('..')) {
  throw new Error('WATERMARK_BINARY must not contain ".." in production');
}

// ── Admin Wallets ─────────────────────────────────────────────
const ADMIN_WALLETS = new Set(
  (process.env.ADMIN_WALLETS || '').toLowerCase().split(',').filter(Boolean)
);

// ── Auth ──────────────────────────────────────────────────────
const ALLOW_MOCK_SIGNATURES = process.env.ALLOW_MOCK_SIGNATURES === 'true';
const SIWE_DOMAIN = process.env.SIWE_DOMAIN || undefined;

// ── Rate Limiting ─────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 min
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

// ── Server ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Mock Mode ─────────────────────────────────────────────────
const USE_MOCK_BLOCKCHAIN = process.env.USE_MOCK_BLOCKCHAIN === 'true';
const USE_MOCK_WATERMARK = process.env.USE_MOCK_WATERMARK === 'true';
const USE_MOCK_IPFS = process.env.USE_MOCK_IPFS === 'true';
const USE_MOCK_ARWEAVE = process.env.USE_MOCK_ARWEAVE === 'true';
const USE_MOCK_AI = process.env.USE_MOCK_AI === 'true';

// ── File Upload ───────────────────────────────────────────────
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || String(50 * 1024 * 1024), 10);
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// ── Production-Required Variables (fail-fast) ─────────────────
// Only validated when the corresponding service is NOT in mock mode.
// This prevents startup failures in dev/test while catching misconfigs in prod.
if (isProduction) {
  if (!USE_MOCK_BLOCKCHAIN) {
    requireEnv('POLYGON_RPC_URL');
    requireEnv('MINTER_PRIVATE_KEY');
    requireEnv('NFTMARKET_CONTRACT_ADDRESS');
  }
  if (!USE_MOCK_IPFS) {
    requireEnv('PINATA_JWT');
  }
}

// Warn about optional but important vars at startup (not in test mode)
if (!isTest) {
  if (!USE_MOCK_AI && !process.env.STABILITY_API_KEY) {
    console.warn('[Config] STABILITY_API_KEY not set — AI generation will fail');
  }
  if (!USE_MOCK_ARWEAVE && !process.env.ARWEAVE_WALLET_JSON) {
    console.warn('[Config] ARWEAVE_WALLET_JSON not set — Arweave uploads will fail');
  }
}

module.exports = {
  NODE_ENV,
  isProduction,
  isTest,
  PORT,
  // Security
  ALLOWED_ORIGINS,
  ADMIN_WALLETS,
  ALLOW_MOCK_SIGNATURES,
  SIWE_DOMAIN,
  WATERMARK_BINARY,
  // Rate limiting
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  // Mock mode
  USE_MOCK_BLOCKCHAIN,
  USE_MOCK_WATERMARK,
  USE_MOCK_IPFS,
  USE_MOCK_ARWEAVE,
  USE_MOCK_AI,
  // File upload
  MAX_FILE_SIZE,
  ALLOWED_IMAGE_TYPES,
  // Helpers
  requireEnv,
  envOrDefault,
};
