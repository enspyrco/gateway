/**
 * test-nonce-concurrency.js
 *
 * Stress test for the per-account nonce serialization in
 * src/services/blockchain.js. Fires N transactions from the SAME account
 * simultaneously and asserts:
 *   1. every send succeeds (no "nonce has already been used"),
 *   2. each landed tx has a DISTINCT nonce,
 *   3. the nonces are CONTIGUOUS (start, start+1, ... start+N-1).
 *
 * Before the fix every concurrent send read getTransactionCount('pending')
 * before any had submitted, so they all reused the same nonce and all but one
 * collided. With serialization they queue and each gets the next nonce.
 *
 * Usage (against a live chain — local Hardhat/Anvil or the box via RPC_URL):
 *   RPC_URL=http://localhost:8545 node test-nonce-concurrency.js
 *   # on the box, inside a container that can reach the chain:
 *   RPC_URL=http://hardhat:8545 node test-nonce-concurrency.js
 *
 * Env:
 *   RPC_URL   - chain RPC (default http://localhost:8545)
 *   TEST_PK   - funded private key (default = Hardhat account #0)
 *   COUNT     - number of concurrent sends (default 5)
 */

const { ethers } = require('ethers');
const { sendTransaction, getProvider } = require('./src/services/blockchain');

// Hardhat/Anvil default account #0 — funded on a fresh dev chain.
const DEFAULT_PK =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function main() {
  const pk = process.env.TEST_PK || DEFAULT_PK;
  const count = Number(process.env.COUNT || 5);
  const wallet = new ethers.Wallet(pk, getProvider());

  const startNonce = await getProvider().getTransactionCount(
    wallet.address,
    'pending'
  );

  console.log(`Chain:   ${process.env.RPC_URL || 'http://localhost:8545'}`);
  console.log(`Sender:  ${wallet.address}`);
  console.log(`Start nonce (pending): ${startNonce}`);
  console.log(`Firing ${count} concurrent self-transfers...\n`);

  // Fire all sends at once — this is the racy condition that used to collide.
  const settled = await Promise.allSettled(
    Array.from({ length: count }, (_, i) =>
      // self-transfer of 1 wei, empty calldata
      sendTransaction(pk, wallet.address, '0x', '1').then((r) => ({ i, ...r }))
    )
  );

  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const failed = settled.filter((s) => s.status === 'rejected');

  // Pull the actual on-chain nonce for each successful tx.
  const withNonce = [];
  for (const r of ok) {
    const tx = await getProvider().getTransaction(r.hash);
    withNonce.push({ i: r.i, hash: r.hash, nonce: tx.nonce, status: r.status });
  }
  withNonce.sort((a, b) => a.nonce - b.nonce);

  console.log('Results:');
  for (const r of withNonce) {
    console.log(
      `  send #${r.i}  nonce=${r.nonce}  status=${r.status}  ${r.hash}`
    );
  }
  for (const f of failed) {
    console.log(`  FAILED: ${f.reason && f.reason.message}`);
  }

  // --- Assertions ---
  const nonces = withNonce.map((r) => r.nonce);
  const distinct = new Set(nonces).size === nonces.length;
  const contiguous = nonces.every((n, idx) => n === startNonce + idx);
  const allSucceeded = failed.length === 0 && ok.length === count;
  const allStatusOk = withNonce.every((r) => r.status === 'success');

  console.log('\nChecks:');
  console.log(`  all ${count} sent ok:      ${allSucceeded ? 'PASS' : 'FAIL'}`);
  console.log(`  distinct nonces:        ${distinct ? 'PASS' : 'FAIL'}`);
  console.log(`  contiguous from ${startNonce}:  ${contiguous ? 'PASS' : 'FAIL'}`);
  console.log(`  all mined success:      ${allStatusOk ? 'PASS' : 'FAIL'}`);

  const pass = allSucceeded && distinct && contiguous && allStatusOk;
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('Test errored:', err);
  process.exit(1);
});
