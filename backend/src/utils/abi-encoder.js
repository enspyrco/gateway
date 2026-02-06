/**
 * ABI Encoder Utility
 *
 * Encodes smart contract function calls so Flutter doesn't need to know about ABI.
 * This is the ONLY place where function selectors and encoding logic should exist.
 */

const { ethers } = require('ethers');

// Contract ABI fragments for encoding
const CONTRACT_ABI = [
  'function list(uint256 tokenId, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 expiry, bytes signature)',
  'function buy(uint256 tokenId, uint8 licenseType, bytes signature) payable',
  'function delist(uint256 tokenId, uint8 licenseType)',
  'function delistAll(uint256 tokenId)'
];

const iface = new ethers.Interface(CONTRACT_ABI);

/**
 * Encode a list() call
 * @param {number} tokenId
 * @param {string} price - Price in wei as string
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {string} licenseHash - bytes32 hash
 * @param {number} expiry - Unix timestamp or 0
 * @param {string} signature - Hex signature from signing
 * @returns {string} Encoded transaction data
 */
function encodeList(tokenId, price, licenseType, licenseHash, expiry, signature) {
  return iface.encodeFunctionData('list', [
    tokenId,
    price,
    licenseType,
    licenseHash,
    expiry,
    signature
  ]);
}

/**
 * Encode a buy() call
 * @param {number} tokenId
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {string} signature - Hex signature from signing
 * @returns {string} Encoded transaction data
 */
function encodeBuy(tokenId, licenseType, signature) {
  return iface.encodeFunctionData('buy', [
    tokenId,
    licenseType,
    signature
  ]);
}

/**
 * Encode a delist() call
 * @param {number} tokenId
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @returns {string} Encoded transaction data
 */
function encodeDelist(tokenId, licenseType) {
  return iface.encodeFunctionData('delist', [
    tokenId,
    licenseType
  ]);
}

/**
 * Encode a delistAll() call
 * @param {number} tokenId
 * @returns {string} Encoded transaction data
 */
function encodeDelistAll(tokenId) {
  return iface.encodeFunctionData('delistAll', [tokenId]);
}

module.exports = {
  encodeList,
  encodeBuy,
  encodeDelist,
  encodeDelistAll
};
