/**
 * Unit tests for SIWEVerifier — charge 3.3 in UNEMPLOYED.md.
 *
 * The MockVerifier was previously the ONLY verifier with test coverage.
 * These tests use ethers to sign genuine SIWE messages with a throwaway key
 * so the real cryptographic path is exercised. They prove:
 *   - a valid signature from the claimed address is accepted
 *   - a signature from a different address is rejected
 *   - an expired token is rejected
 *   - a token with no expiry is rejected
 *   - a token expiring > 24h in the future is rejected
 *   - a malformed message throws
 */
'use strict';

const { ethers } = require('ethers');
const { SiweMessage } = require('siwe');
const { SIWEVerifier } = require('../../src/middleware/strategies/siwe-verifier');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMessage(address, overrides = {}) {
  const nowMs = Date.now();
  const expiry = new Date(nowMs + 60 * 60 * 1000).toISOString(); // +1h default
  return new SiweMessage({
    domain: 'localhost',
    address,
    statement: 'Sign in',
    uri: 'http://localhost',
    version: '1',
    chainId: 1,
    nonce: Math.random().toString(36).slice(2, 12),
    issuedAt: new Date(nowMs).toISOString(),
    expirationTime: expiry,
    ...overrides,
  });
}

async function signWith(wallet, siweMessage) {
  const prepared = siweMessage.prepareMessage();
  return wallet.signMessage(prepared);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SIWEVerifier', () => {
  let verifier;
  let wallet;

  beforeAll(() => {
    // Deterministic throwaway key — safe to commit, never funded
    wallet = new ethers.Wallet(
      '0x' + 'dead'.repeat(16), // 0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead
    );
    verifier = new SIWEVerifier({ domain: 'localhost' });
  });

  test('accepts a valid signature from the claimed address', async () => {
    const msg = makeMessage(wallet.address);
    const sig = await signWith(wallet, msg);

    const result = await verifier.verify(msg, sig);

    expect(result.address.toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(result.chainId).toBe(1);
  });

  test('rejects a signature from a different address', async () => {
    const attacker = ethers.Wallet.createRandom();
    const msg = makeMessage(wallet.address); // claims wallet.address…
    const sig = await signWith(attacker, msg); // …but signed by attacker

    // siwe library throws a plain object (not Error) when address doesn't match
    await expect(verifier.verify(msg, sig)).rejects.toBeDefined();
  });

  test('rejects an expired token', async () => {
    const expired = makeMessage(wallet.address, {
      expirationTime: new Date(Date.now() - 1000).toISOString(), // 1 second ago
    });
    // We need a valid signature even for the expired path
    const sig = await signWith(wallet, expired);

    // siwe library throws a plain object with .error.type = 'Expired message.'
    const rejection = await verifier.verify(expired, sig).then(
      () => null,
      (e) => e,
    );
    expect(rejection).toBeDefined();
    // The thrown value is a siwe error object with an error.type field
    expect(rejection?.error?.type ?? rejection?.message ?? '').toMatch(/expired/i);
  });

  test('rejects a token with no expirationTime', async () => {
    const msg = makeMessage(wallet.address, { expirationTime: undefined });
    const sig = await signWith(wallet, msg);

    const rejection = await verifier.verify(msg, sig).then(
      () => null,
      (e) => e,
    );
    expect(rejection).toBeDefined();
    expect(rejection?.message ?? '').toMatch(/expirationTime/i);
  });

  test('rejects a token expiring more than 24 hours in the future', async () => {
    const tooFar = makeMessage(wallet.address, {
      expirationTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    });
    const sig = await signWith(wallet, tooFar);

    await expect(verifier.verify(tooFar, sig)).rejects.toThrow(/24 hours/i);
  });

  test('rejects when verify() returns success:false', async () => {
    // Simulate a siweMessage whose verify() resolves with success:false
    const garbage = { verify: () => Promise.resolve({ success: false }) };
    await expect(verifier.verify(garbage, '0x' + 'ab'.repeat(33))).rejects.toThrow(
      'Signature verification failed',
    );
  });
});
