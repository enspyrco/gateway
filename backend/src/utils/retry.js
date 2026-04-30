/**
 * Retry with Exponential Backoff
 *
 * Wraps an async function with retry logic. Only use for idempotent
 * read operations and uploads — never for blockchain transactions.
 */

const DEFAULT_OPTIONS = {
  attempts: 3,
  baseDelay: 500, // ms
  maxDelay: 5000,
};

/**
 * Retry an async function with exponential backoff.
 * @param {() => Promise<T>} fn - The async function to retry
 * @param {Object} [options]
 * @param {number} [options.attempts=3]
 * @param {number} [options.baseDelay=500]
 * @param {number} [options.maxDelay=5000]
 * @returns {Promise<T>}
 * @template T
 */
async function retry(fn, options = {}) {
  const { attempts, baseDelay, maxDelay } = { ...DEFAULT_OPTIONS, ...options };

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = { retry };
