const { ethers } = require('ethers');

/**
 * Sign a message using personal_sign (EIP-191)
 * @param {string} privateKey - The private key
 * @param {string} message - The message to sign
 * @returns {Promise<string>} The signature
 */
async function signMessage(privateKey, message) {
  const wallet = new ethers.Wallet(privateKey);
  const signature = await wallet.signMessage(message);
  return signature;
}

/**
 * Sign EIP-712 typed data
 * @param {string} privateKey - The private key
 * @param {object} domain - The EIP-712 domain
 * @param {object} types - The type definitions
 * @param {object} value - The message values
 * @returns {Promise<string>} The signature as hex string
 */
async function signTypedData(privateKey, domain, types, value) {
  const wallet = new ethers.Wallet(privateKey);

  // Remove EIP712Domain from types if present (ethers handles it automatically)
  const typesWithoutDomain = { ...types };
  delete typesWithoutDomain.EIP712Domain;

  const signature = await wallet.signTypedData(domain, typesWithoutDomain, value);
  return signature;
}

/**
 * Sign a hash directly (for custom hashing)
 * @param {string} privateKey - The private key
 * @param {string} hash - The hash to sign (hex string, 32 bytes)
 * @returns {string} The signature
 */
function signHash(privateKey, hash) {
  const signingKey = new ethers.SigningKey(privateKey);

  // Ensure hash is bytes
  const hashBytes = ethers.getBytes(hash);

  const signature = signingKey.sign(hashBytes);

  // Return as serialized signature (r + s + v)
  return ethers.Signature.from(signature).serialized;
}

/**
 * Recover the address from a signed message
 * @param {string} message - The original message
 * @param {string} signature - The signature
 * @returns {string} The recovered address
 */
function recoverAddress(message, signature) {
  return ethers.verifyMessage(message, signature);
}

module.exports = {
  signMessage,
  signTypedData,
  signHash,
  recoverAddress,
};
