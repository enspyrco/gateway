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

// ---------------------------------------------------------------------------
// Per-account nonce serialization
//
// Concurrent /api/transaction/send requests for the SAME account previously
// each called getTransactionCount(addr, 'pending') before any had submitted, so
// they all picked the same nonce and collided with "nonce has already been used"
// (observed on the box during populate.js: 3 of 18 listings dropped this way).
//
// We fix it with an explicit NonceManager-equivalent, two parts:
//   1. sendChains — a per-account promise chain (async mutex) that serializes the
//      nonce-allocate → submit window so only one send is in it at a time.
//   2. nextNonce — a per-account in-memory counter, lazily seeded from on-chain
//      'pending', incremented after each successful submit, and reset to null on
//      any submit error so a failed send re-reads from chain instead of poisoning
//      every subsequent send.
//
// Confirmation (.wait()) is deliberately awaited OUTSIDE the lock — the lock only
// guards allocation + submission, so concurrent sends queue for the brief submit
// window rather than blocking on block mining.
// ---------------------------------------------------------------------------
const sendChains = new Map(); // address(lowercase) -> Promise (tail of the queue)
const nextNonce = new Map(); // address(lowercase) -> next nonce to use, or undefined

/**
 * Run `task` serialized against all other sends for `address`. Prior failures in
 * the chain are swallowed so one failed send doesn't reject every queued send.
 * @param {string} address
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 * @template T
 */
function runSerialized(address, task) {
  const key = address.toLowerCase();
  const prev = sendChains.get(key) || Promise.resolve();
  const next = prev.then(task, task); // run task regardless of prior outcome
  // Keep the chain alive without leaking an unhandled rejection from `next`.
  sendChains.set(key, next.then(() => {}, () => {}));
  return next;
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
  const key = wallet.address.toLowerCase();

  // Serialize nonce allocation + submission per account. Returns once the tx is
  // accepted by the node (hash known); we await confirmation below, outside the lock.
  const txResponse = await runSerialized(wallet.address, async () => {
    // Seed the in-memory nonce from chain the first time, or after a prior error
    // reset it. 'pending' so we account for any tx already in the mempool.
    let nonce = nextNonce.get(key);
    if (nonce === undefined) {
      nonce = await getProvider().getTransactionCount(wallet.address, 'pending');
    }

    const tx = {
      to,
      data,
      value: BigInt(value),
      nonce,
    };

    try {
      // Estimate gas + add 20% buffer.
      const gasEstimate = await wallet.estimateGas(tx);
      tx.gasLimit = (gasEstimate * 120n) / 100n;

      // Submit. Resolves once the node accepts the tx (hash assigned).
      const response = await wallet.sendTransaction(tx);

      // Submission succeeded: the nonce is now consumed (a later on-chain revert
      // still consumes it), so advance the in-memory counter for the next send.
      nextNonce.set(key, nonce + 1);
      return response;
    } catch (err) {
      // Submission failed: the nonce may not have been consumed. Drop the cached
      // counter so the next send re-reads the true value from chain.
      nextNonce.delete(key);
      throw err;
    }
  });

  // Wait for confirmation outside the lock so concurrent sends aren't blocked on mining.
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
