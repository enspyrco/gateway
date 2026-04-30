/**
 * Jest test setup
 * Sets mock environment variables before tests run
 */

// Enable all mock modes
process.env.USE_MOCK_WATERMARK = 'true';
process.env.USE_MOCK_IPFS = 'true';
process.env.USE_MOCK_ARWEAVE = 'true';
process.env.USE_MOCK_FIRESTORE = 'true';
process.env.USE_MOCK_BLOCKCHAIN = 'true';
process.env.USE_MOCK_AI = 'true';
process.env.USE_KMS = 'false';
process.env.NODE_ENV = 'test';
process.env.MOCK_PERSISTENCE = 'false';

// Auth: allow mock SIWE signatures in tests
process.env.ALLOW_MOCK_SIGNATURES = 'true';

// Dev encryption key (32 bytes hex)
process.env.DEV_ENCRYPTION_KEY = 'a'.repeat(64);

// Suppress console.log during tests (optional - comment out to debug)
// global.console.log = jest.fn();

/**
 * Global cleanup after all tests complete
 * Note: Services with background timers (like ai-generation.js) skip starting
 * their intervals when NODE_ENV=test to ensure Jest exits cleanly.
 */
