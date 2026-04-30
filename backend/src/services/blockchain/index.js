/**
 * Blockchain Service — Abstract Factory
 *
 * Selects the real or mock implementation based on USE_MOCK_BLOCKCHAIN env var.
 * All consumers require('./services/blockchain') and get the same interface.
 */

const USE_MOCK = process.env.USE_MOCK_BLOCKCHAIN === 'true';
const { LicenseType, EIP712_TYPES } = require('./interface');

const service = USE_MOCK
  ? require('./mock-service')
  : require('./real-service');

module.exports = {
  ...service,
  LicenseType,
  EIP712_TYPES,
};
