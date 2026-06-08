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
//
// SCOPE — this is a PROCESS-LOCAL serializer. It assumes exactly one
// wallet-service process signs for a given account (true today: one container,
// one node process). Horizontal scaling (multiple replicas/workers) or any
// external signer using the same account is OUTSIDE this boundary and would
// reintroduce the race — that needs a shared nonce source (Redis/DB) or sticky
// per-account routing. See the follow-up robustness task for the distributed
// case + ambiguous-broadcast / dropped-pending reconciliation.
// ---------------------------------------------------------------------------
const sendChains = new Map(); // address(lowercase) -> Promise (tail of the queue)
// nextNonce holds primitive numbers keyed by distinct signer address — bounded by
// the (small, fixed) account set this service signs for, so it is intentionally
// retained across idle periods (re-reading 'pending' would reintroduce the
// pending-lag race the counter exists to defeat).
const nextNonce = new Map(); // address(lowercase) -> next nonce to use, or undefined

/**
 * Run `task` serialized against all other sends for `address`. Prior failures in
 * the chain are swallowed so one failed send doesn't reject every queued send.
 * The per-account chain entry is evicted once the queue drains, so idle accounts
 * don't accumulate promise references forever.
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
  const tail = next.then(() => {}, () => {});
  sendChains.set(key, tail);
  // Evict when this tail drains, UNLESS a newer send has already chained on (in
  // which case the stored tail is no longer ours). Single-threaded JS guarantees
  // this check and any concurrent runSerialized() call can't interleave mid-statement,
  // so neither ordering can drop a live chain.
  tail.then(() => {
    if (sendChains.get(key) === tail) {
      sendChains.delete(key);
    }
  });
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

  // Validate/convert the value BEFORE entering the lock — a malformed value should
  // fail fast as a plain error and never occupy the per-account critical section.
  const valueWei = BigInt(value);

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
      value: valueWei,
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
