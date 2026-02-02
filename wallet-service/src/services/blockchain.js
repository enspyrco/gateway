const { ethers } = require('ethers');

// Provider instance (lazy initialized)
let provider = null;

/**
 * Get the blockchain provider
 * @returns {ethers.JsonRpcProvider} The provider
 */
function getProvider() {
  if (!provider) {
    const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
    provider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return provider;
}

/**
 * Get wallet connected to provider
 * @param {string} privateKey - The private key
 * @returns {ethers.Wallet} The wallet
 */
function getWallet(privateKey) {
  return new ethers.Wallet(privateKey, getProvider());
}

/**
 * Send a transaction
 * @param {string} privateKey - The sender's private key
 * @param {string} to - The recipient address
 * @param {string} data - The transaction data (hex)
 * @param {string} value - The value in wei (string)
 * @returns {Promise<object>} Transaction result
 */
async function sendTransaction(privateKey, to, data, value = '0') {
  const wallet = getWallet(privateKey);

  // Get the latest nonce explicitly to avoid stale cache issues
  const nonce = await getProvider().getTransactionCount(wallet.address, 'latest');

  const tx = {
    to,
    data,
    value: BigInt(value),
    nonce,
  };

  // Estimate gas
  const gasEstimate = await wallet.estimateGas(tx);

  // Add 20% buffer to gas estimate
  tx.gasLimit = (gasEstimate * 120n) / 100n;

  // Send transaction
  const txResponse = await wallet.sendTransaction(tx);

  // Wait for confirmation
  const receipt = await txResponse.wait();

  return {
    hash: txResponse.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === 1 ? 'success' : 'failed',
  };
}

/**
 * Get account balance
 * @param {string} address - The address
 * @returns {Promise<string>} Balance in wei
 */
async function getBalance(address) {
  const balance = await getProvider().getBalance(address);
  return balance.toString();
}

/**
 * Get current nonce for an address
 * @param {string} address - The address
 * @returns {Promise<number>} The nonce
 */
async function getNonce(address) {
  return await getProvider().getTransactionCount(address);
}

/**
 * Get chain ID
 * @returns {Promise<number>} The chain ID
 */
async function getChainId() {
  const network = await getProvider().getNetwork();
  return Number(network.chainId);
}

module.exports = {
  getProvider,
  getWallet,
  sendTransaction,
  getBalance,
  getNonce,
  getChainId,
};
