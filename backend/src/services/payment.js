/**
 * Payment Verification Service
 * Handles USDC payment verification on Polygon
 *
 * Set USE_MOCK_PAYMENTS=true for testing without real blockchain
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

const USE_MOCK = process.env.USE_MOCK_PAYMENTS === 'true';

// Mock storage for testing
const mockPayments = new Map();

// Payment contract ABI (minimal, just what we need)
const PAYMENT_CONTRACT_ABI = [
  'function verifyPayment(bytes32 paymentId) view returns (bool)',
  'function getFees() view returns (uint256 generation1, uint256 generation4, uint256 mint)',
  'function getFeeFor(uint8 imageCount) view returns (uint256)',
  'function paymentProcessed(bytes32 paymentId) view returns (bool)',
  'event GenerationPaid(address indexed user, bytes32 indexed paymentId, uint256 amount, uint8 imageCount)',
  'event MintPaid(address indexed user, bytes32 indexed paymentId, uint256 amount)',
];

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// Default fees (for mock mode)
const DEFAULT_FEES = {
  generation1: ethers.parseUnits('0.50', USDC_DECIMALS),  // $0.50
  generation4: ethers.parseUnits('1.50', USDC_DECIMALS),  // $1.50
  mint: ethers.parseUnits('1.00', USDC_DECIMALS),         // $1.00
};

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const PAYMENT_CONTRACT_ADDRESS = process.env.PAYMENT_CONTRACT_ADDRESS;

let provider = null;
let contract = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

function getContract() {
  if (!contract) {
    if (!PAYMENT_CONTRACT_ADDRESS) {
      throw new Error('PAYMENT_CONTRACT_ADDRESS environment variable required');
    }
    contract = new ethers.Contract(PAYMENT_CONTRACT_ADDRESS, PAYMENT_CONTRACT_ABI, getProvider());
  }
  return contract;
}

/**
 * Create a unique payment ID
 * @param {string} wallet - User's wallet address
 * @param {string} type - 'generation' or 'mint'
 * @param {string} nonce - Unique nonce (e.g., UUID)
 * @returns {string} - bytes32 payment ID (0x prefixed)
 */
function createPaymentId(wallet, type, nonce) {
  const data = ethers.solidityPackedKeccak256(
    ['address', 'string', 'string'],
    [wallet, type, nonce]
  );
  return data;
}

/**
 * Verify a payment has been processed on-chain
 * @param {string} paymentId - The payment ID to verify (bytes32, 0x prefixed)
 * @returns {Promise<boolean>}
 */
async function verifyPayment(paymentId) {
  if (USE_MOCK) {
    return mockPayments.has(paymentId);
  }

  const paymentContract = getContract();
  return paymentContract.verifyPayment(paymentId);
}

/**
 * Get current fee structure from contract
 * @returns {Promise<{generation1: string, generation4: string, mint: string}>}
 */
async function getFees() {
  if (USE_MOCK) {
    return {
      generation1: ethers.formatUnits(DEFAULT_FEES.generation1, USDC_DECIMALS),
      generation4: ethers.formatUnits(DEFAULT_FEES.generation4, USDC_DECIMALS),
      mint: ethers.formatUnits(DEFAULT_FEES.mint, USDC_DECIMALS),
    };
  }

  const paymentContract = getContract();
  const fees = await paymentContract.getFees();

  return {
    generation1: ethers.formatUnits(fees.generation1, USDC_DECIMALS),
    generation4: ethers.formatUnits(fees.generation4, USDC_DECIMALS),
    mint: ethers.formatUnits(fees.mint, USDC_DECIMALS),
  };
}

/**
 * Get fee for a specific operation
 * @param {string} type - 'generation1', 'generation4', or 'mint'
 * @returns {Promise<{amount: string, amountRaw: string}>}
 */
async function getFeeFor(type) {
  if (USE_MOCK) {
    let amount;
    switch (type) {
      case 'generation1':
        amount = DEFAULT_FEES.generation1;
        break;
      case 'generation4':
        amount = DEFAULT_FEES.generation4;
        break;
      case 'mint':
        amount = DEFAULT_FEES.mint;
        break;
      default:
        throw new Error(`Invalid fee type: ${type}`);
    }
    return {
      amount: ethers.formatUnits(amount, USDC_DECIMALS),
      amountRaw: amount.toString(),
    };
  }

  const paymentContract = getContract();
  let imageCount;

  switch (type) {
    case 'generation1':
      imageCount = 1;
      break;
    case 'generation4':
      imageCount = 4;
      break;
    case 'mint':
      imageCount = 0;
      break;
    default:
      throw new Error(`Invalid fee type: ${type}`);
  }

  const feeRaw = await paymentContract.getFeeFor(imageCount);
  return {
    amount: ethers.formatUnits(feeRaw, USDC_DECIMALS),
    amountRaw: feeRaw.toString(),
  };
}

/**
 * Get payment contract address
 * @returns {string}
 */
function getPaymentContractAddress() {
  if (USE_MOCK) {
    return '0x' + '0'.repeat(40); // Zero address in mock mode
  }
  return PAYMENT_CONTRACT_ADDRESS;
}

/**
 * Get USDC contract address (Polygon mainnet)
 * @returns {string}
 */
function getUSDCAddress() {
  // Native USDC on Polygon
  return '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
}

// ============ Mock Functions (for testing) ============

/**
 * Record a mock payment (for testing only)
 * @param {string} paymentId - Payment ID
 * @param {Object} data - Payment data
 */
function recordMockPayment(paymentId, data) {
  if (!USE_MOCK) {
    throw new Error('recordMockPayment only available in mock mode');
  }
  mockPayments.set(paymentId, {
    ...data,
    processedAt: new Date(),
  });
}

/**
 * Reset mock storage (for testing)
 */
function resetMock() {
  mockPayments.clear();
}

/**
 * Get all mock payments (for testing)
 */
function getMockPayments() {
  return Object.fromEntries(mockPayments);
}

module.exports = {
  createPaymentId,
  verifyPayment,
  getFees,
  getFeeFor,
  getPaymentContractAddress,
  getUSDCAddress,
  // Mock utilities
  recordMockPayment,
  resetMock,
  getMockPayments,
};
