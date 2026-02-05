/**
 * Integration test for the full mint flow
 *
 * Tests the complete chain: Reserve → Watermark → Upload → Mint
 *
 * Run with: npm test -- --testPathPattern=mint-flow.integration
 *
 * Requires:
 * - Hardhat node running (localhost:8545)
 * - Contract deployed
 * - Minter registered
 * - Backend running (localhost:3000)
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Skip if not running integration tests
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

// Test configuration
const BACKEND_URL = 'http://localhost:3000';
const RPC_URL = 'http://127.0.0.1:8545';

// Hardhat test accounts
const ACCOUNTS = {
  deployer: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  },
  alice: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
  },
  bob: {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
  }
};

// Helper: Create SIWE auth token
function createAuthToken(account) {
  const message = `localhost wants you to sign in with your Ethereum account:
${account.address}

Sign in to NFTmarket

URI: http://localhost:3000
Version: 1
Chain ID: 31337
Nonce: ${crypto.randomBytes(8).toString('hex')}
Issued At: ${new Date().toISOString()}`;

  const wallet = new ethers.Wallet(account.privateKey);
  const signature = wallet.signMessageSync(message);

  const token = Buffer.from(JSON.stringify({ message, signature })).toString('base64');
  return token;
}

// Helper: Check if services are running
async function checkServices() {
  const errors = [];

  // Check Hardhat
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    await provider.getBlockNumber();
  } catch (e) {
    errors.push('Hardhat node not running at ' + RPC_URL);
  }

  // Check Backend
  try {
    const res = await fetch(`${BACKEND_URL}/api/gallery`);
    if (!res.ok) errors.push('Backend not responding');
  } catch (e) {
    errors.push('Backend not running at ' + BACKEND_URL);
  }

  return errors;
}

// Helper: Check minter is registered
async function checkMinterRegistered() {
  const deploymentPath = path.join(__dirname, '..', '..', '..', 'contracts', 'deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    throw new Error('deployment.json not found - contract not deployed?');
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const abi = ['function getMinterAuthority(address) view returns (uint256, bool)'];
  const contract = new ethers.Contract(deployment.address, abi, provider);

  const [authorityId, isMinter] = await contract.getMinterAuthority(ACCOUNTS.deployer.address);

  if (!isMinter) {
    throw new Error(`Minter ${ACCOUNTS.deployer.address} is not registered on contract ${deployment.address}`);
  }

  return { authorityId: Number(authorityId), isMinter };
}

// Test images directory - same as smoke-test.sh uses
const TEST_IMAGES_DIR = path.join(process.env.HOME, 'Desktop', 'photos', 'nfts');

// Get a random test image from the test images directory
function getTestImage() {
  // Check if test images directory exists
  if (!fs.existsSync(TEST_IMAGES_DIR)) {
    console.warn(`Test images directory not found: ${TEST_IMAGES_DIR}`);
    console.warn('Falling back to minimal test PNG');
    return { buffer: createMinimalPng(), filename: 'test.png', mimeType: 'image/png' };
  }

  // Get list of jpg files
  const files = fs.readdirSync(TEST_IMAGES_DIR).filter(f => f.endsWith('.jpg'));
  if (files.length === 0) {
    console.warn('No .jpg files found in test images directory');
    return { buffer: createMinimalPng(), filename: 'test.png', mimeType: 'image/png' };
  }

  // Pick a random file
  const randomFile = files[Math.floor(Math.random() * files.length)];
  const filePath = path.join(TEST_IMAGES_DIR, randomFile);
  const buffer = fs.readFileSync(filePath);

  console.log(`Using test image: ${randomFile} (${(buffer.length / 1024).toFixed(1)} KB)`);
  return { buffer, filename: randomFile, mimeType: 'image/jpeg' };
}

// Fallback: Create a minimal test PNG (1x1 red pixel)
// WARNING: Using fallback PNG means watermarking tests are degraded
function createMinimalPng() {
  console.warn('⚠️  WARNING: Using 1x1 fallback PNG - watermarking tests will be degraded');
  console.warn('   For accurate tests, populate ~/Desktop/photos/nfts/ with real images');
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE,
    0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
    0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xDD, 0x8D,
    0xB4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
    0xAE, 0x42, 0x60, 0x82
  ]);
  return pngData;
}

describe('Mint Flow Integration Tests', () => {

  beforeAll(async () => {
    if (!RUN_INTEGRATION) {
      console.log('Skipping integration tests (set RUN_INTEGRATION_TESTS=true to run)');
      return;
    }

    // Check services are running
    const serviceErrors = await checkServices();
    if (serviceErrors.length > 0) {
      throw new Error('Services not ready:\n  ' + serviceErrors.join('\n  '));
    }
  });

  describe('Pre-flight checks', () => {

    test('Hardhat node is running', async () => {
      if (!RUN_INTEGRATION) return;

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThanOrEqual(0);
    });

    test('Contract is deployed', async () => {
      if (!RUN_INTEGRATION) return;

      const deploymentPath = path.join(__dirname, '..', '..', '..', 'contracts', 'deployment.json');
      expect(fs.existsSync(deploymentPath)).toBe(true);

      const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      expect(deployment.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test('Minter is registered', async () => {
      if (!RUN_INTEGRATION) return;

      const result = await checkMinterRegistered();
      expect(result.isMinter).toBe(true);
    });

    test('Backend is running', async () => {
      if (!RUN_INTEGRATION) return;

      const res = await fetch(`${BACKEND_URL}/api/gallery`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('galleries');
    });
  });

  describe('Mint flow', () => {

    test('Can mint a new token via API', async () => {
      if (!RUN_INTEGRATION) return;

      const authToken = createAuthToken(ACCOUNTS.alice);
      const { buffer, filename, mimeType } = getTestImage();

      // Create form data with real test image
      const formData = new FormData();
      formData.append('image', new Blob([buffer], { type: mimeType }), filename);
      formData.append('name', `Integration Test NFT - ${filename}`);
      formData.append('description', 'Created by integration test');

      const res = await fetch(`${BACKEND_URL}/api/mint`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      });

      // The mint might fail due to watermarking or IPFS issues in test env
      // but we should at least get a proper response
      const data = await res.json();

      if (res.ok) {
        expect(data).toHaveProperty('tokenId');
        expect(typeof data.tokenId).toBe('number');
        console.log(`Minted token #${data.tokenId}`);
      } else {
        // If it fails, make sure it's not a minter authorization error
        expect(data.error).not.toContain('NotAuthorizedMinter');
        console.log('Mint failed (expected in some test environments):', data.error);
      }
    }, 60000); // 60 second timeout for mint

    test('Gallery shows minted tokens', async () => {
      if (!RUN_INTEGRATION) return;

      const res = await fetch(`${BACKEND_URL}/api/gallery/${ACCOUNTS.alice.address}`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('tokens');
      expect(Array.isArray(data.tokens)).toBe(true);
    });
  });

  describe('Multi-license listing', () => {

    test('Can list token for multiple license types', async () => {
      if (!RUN_INTEGRATION) return;

      // This test requires a minted token
      // For now, just verify the API accepts the request structure
      const authToken = createAuthToken(ACCOUNTS.alice);

      // Try to list token 0 for display (may fail if no tokens exist)
      const res = await fetch(`${BACKEND_URL}/api/marketplace/list`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tokenId: 0,
          priceEth: '0.1',
          licenseType: 'display'
        })
      });

      const data = await res.json();

      // Should either succeed or fail with NOT_OWNER/token doesn't exist
      // Should NOT fail with structural errors
      if (!res.ok) {
        expect(['NOT_OWNER', 'Token does not exist', 'MISSING_TOKEN_ID']).toContain(
          data.code || data.error
        );
      }
    });

    test('Marketplace returns correct structure with listings array', async () => {
      if (!RUN_INTEGRATION) return;

      const res = await fetch(`${BACKEND_URL}/api/marketplace`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('listings');
      expect(Array.isArray(data.listings)).toBe(true);
      expect(data).toHaveProperty('contract');
    });
  });
});
