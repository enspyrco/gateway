/**
 * MockVerifier — Test-only SIWE verification strategy.
 *
 * Accepts any 66-character hex signature (0x + 64 hex chars) without
 * performing cryptographic verification. Must never be used in production.
 */

class MockVerifier {
  /**
   * Verify a mock SIWE message + signature.
   * @param {import('siwe').SiweMessage} siweMessage
   * @param {string} signature
   * @returns {Promise<{ address: string, chainId: number }>}
   */
  async verify(siweMessage, signature) {
    // Accept any 66-char hex signature in test mode
    if (signature.length !== 66) {
      throw new Error('Invalid mock signature format');
    }
    return { address: siweMessage.address, chainId: siweMessage.chainId };
  }
}

module.exports = { MockVerifier };
