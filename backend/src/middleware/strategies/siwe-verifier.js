/**
 * SIWEVerifier — Production SIWE verification strategy.
 *
 * Verifies signature, enforces expiration, and rejects tokens
 * with expiry more than 24 hours in the future.
 */

class SIWEVerifier {
  /**
   * @param {Object} options
   * @param {string} [options.domain] - Expected domain (optional, passed to siwe.verify)
   * @param {Map} [options.nonceStore] - Map with TTL for nonce tracking (optional)
   */
  constructor({ domain, nonceStore } = {}) {
    this.domain = domain;
    this.nonceStore = nonceStore;
  }

  /**
   * Verify a SIWE message + signature.
   * @param {import('siwe').SiweMessage} siweMessage
   * @param {string} signature
   * @returns {Promise<{ address: string, chainId: number }>}
   */
  async verify(siweMessage, signature) {
    const verifyOptions = { signature };
    if (this.domain) {
      verifyOptions.domain = this.domain;
    }

    const fields = await siweMessage.verify(verifyOptions);
    if (!fields.success) {
      throw new Error('Signature verification failed');
    }

    // Require expiration
    if (!siweMessage.expirationTime) {
      throw new Error('Token must include expirationTime');
    }
    const expiration = new Date(siweMessage.expirationTime);
    if (expiration < new Date()) {
      throw new Error('Token expired');
    }
    // Reject tokens with expiry > 24 hours in the future
    const maxExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (expiration > maxExpiry) {
      throw new Error('Token expiration too far in the future (max 24 hours)');
    }

    return { address: siweMessage.address, chainId: siweMessage.chainId };
  }
}

module.exports = { SIWEVerifier };
