/**
 * Response Builder
 *
 * Enforces consistent response shapes across all API endpoints:
 * - Success responses always have { success: true, data, apiVersion }
 * - Error responses always have { error, code, apiVersion }
 * - licenseType is always normalized to a string externally
 * - Stack traces are stripped in production
 */

const { LICENSE_TYPE_NAMES } = require('./license-utils');

const API_VERSION = '1';

/**
 * Build a success response
 * @param {Object} data - Response payload
 * @returns {Object}
 */
function ok(data) {
  return {
    success: true,
    ...data,
    apiVersion: API_VERSION,
  };
}

/**
 * Build an error response
 * @param {string} code - Machine-readable error code (e.g. 'NOT_FOUND')
 * @param {string} message - Human-readable error message
 * @returns {Object}
 */
function err(code, message) {
  return {
    error: message,
    code,
    apiVersion: API_VERSION,
  };
}

/**
 * Normalize a licenseType value to its string name.
 * Accepts number (0/1/2) or string ('display'/'commercial'/'transfer').
 * Returns the lowercase string name, or 'unknown' if invalid.
 * @param {number|string} licenseType
 * @returns {string}
 */
function normalizeLicenseType(licenseType) {
  if (typeof licenseType === 'number') {
    return LICENSE_TYPE_NAMES[licenseType] || 'unknown';
  }
  if (typeof licenseType === 'string') {
    const lower = licenseType.toLowerCase();
    if (['display', 'commercial', 'transfer'].includes(lower)) return lower;
  }
  return 'unknown';
}

module.exports = {
  ok,
  err,
  normalizeLicenseType,
  API_VERSION,
};
