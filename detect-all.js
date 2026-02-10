#!/usr/bin/env node
/**
 * Detect All Script
 *
 * Combines watermark detection with blockchain provenance to show
 * complete ownership history for each token.
 */

const FormData = require('form-data');

const BACKEND = 'http://localhost:3000';
const WALLET_SERVICE = 'http://localhost:3001';

const accounts = {
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': 'alice',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906': 'bob',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65': 'sam',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc': 'joe',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9': 'mary'
};

function getName(addr) {
  if (!addr) return '?';
  const lower = addr.toLowerCase();
  for (const [key, name] of Object.entries(accounts)) {
    if (key.toLowerCase() === lower) return name;
  }
  return addr.slice(0, 8) + '...';
}

async function getAuthToken(address) {
  const sessionRes = await fetch(WALLET_SERVICE + '/api/accounts/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  }).then(r => r.json());

  const authRes = await fetch(WALLET_SERVICE + '/api/auth/token', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionRes.sessionId }
  }).then(r => r.json());

  return authRes.token;
}

async function detectImage(authToken, imageBuffer) {
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'image.png', contentType: 'image/png' });

  return new Promise((resolve, reject) => {
    const http = require('http');
    const url = new URL(BACKEND + '/api/detect/blind');

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + authToken,
        ...form.getHeaders()
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data.slice(0, 100)));
        }
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    NFT Ownership & Provenance Report                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝\n');

  const authToken = await getAuthToken('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');

  // Get all tokens from gallery
  const galleries = await fetch(BACKEND + '/api/gallery').then(r => r.json());

  const allTokens = [];
  for (const gallery of galleries.galleries || []) {
    const detail = await fetch(BACKEND + '/api/gallery/' + gallery.address).then(r => r.json());
    for (const token of detail.tokens || []) {
      allTokens.push({ ...token, currentOwner: gallery.address });
    }
  }

  console.log(`Analyzing ${allTokens.length} tokens...\n`);

  const results = [];

  for (const token of allTokens.sort((a, b) => a.tokenId - b.tokenId)) {
    const imageUrl = token.imageUrl || token.previewUrl;

    let watermark = { detected: false };
    if (imageUrl) {
      try {
        const imageRes = await fetch(imageUrl);
        if (imageRes.ok) {
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
          watermark = await detectImage(authToken, imageBuffer);
        }
      } catch (e) {
        watermark = { error: e.message };
      }
    }

    results.push({
      tokenId: token.tokenId,
      blockchain: {
        creator: token.creator,
        currentOwner: token.currentOwner,
        copyrightOwner: token.copyrightOwner,
        licenseType: token.licenseType,
        parentToken: token.parentToken,
        isOriginal: token.isOriginal !== false
      },
      watermark
    });
  }

  // Display results
  console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    const bc = r.blockchain;
    const wm = r.watermark;

    const isLicense = bc.parentToken !== undefined && bc.parentToken !== null && bc.parentToken !== r.tokenId;

    console.log(`TOKEN #${r.tokenId}${isLicense ? ' (License Token)' : ''}`);
    console.log('─────────────────────────────────────────────────────────────────────────');

    // Watermark info
    if (wm.detected) {
      console.log(`  Watermark:     "${wm.message}"`);
      console.log(`                 Minted by ${getName(wm.wallet)} as token #${wm.tokenId}`);
      console.log(`                 Confidence: ${wm.confidence?.toFixed(2)}, Sequences: ${wm.sequencesDecoded}`);
    } else if (wm.error) {
      console.log(`  Watermark:     Error - ${wm.error}`);
    } else {
      console.log(`  Watermark:     Not detected`);
    }

    // Blockchain info
    console.log(`  Blockchain:`);
    console.log(`    Creator:       ${getName(bc.creator)}`);
    console.log(`    Current Owner: ${getName(bc.currentOwner)}`);
    console.log(`    Copyright:     ${getName(bc.copyrightOwner)}`);
    console.log(`    License Type:  ${bc.licenseType || 'transfer'}`);

    if (isLicense) {
      console.log(`    Parent Token:  #${bc.parentToken}`);
    }

    // Ownership determination
    console.log(`  ─────────────────────────────────────────────────────────────────────`);

    if (wm.detected) {
      const wmCreator = getName(wm.wallet);
      const bcCreator = getName(bc.creator);
      const bcOwner = getName(bc.currentOwner);
      const bcCopyright = getName(bc.copyrightOwner);

      if (isLicense) {
        // License token - watermark shows parent, blockchain shows derivative
        console.log(`  PROVENANCE:`);
        console.log(`    Original NFT:  Token #${wm.tokenId} by ${wmCreator}`);
        console.log(`    License sold:  ${bc.licenseType} rights`);
        console.log(`    License owner: ${bcOwner}`);
        if (bc.licenseType === 'transfer') {
          console.log(`    Copyright:     Transferred to ${bcCopyright}`);
        } else {
          console.log(`    Copyright:     Retained by original creator`);
        }
      } else {
        // Original token
        const creatorMatch = wm.wallet?.toLowerCase() === bc.creator?.toLowerCase();

        if (creatorMatch) {
          console.log(`  PROVENANCE:`);
          console.log(`    Minted by:     ${wmCreator} ✓ (verified by watermark)`);

          if (bcOwner === bcCreator) {
            console.log(`    Status:        Original owner, never sold`);
          } else {
            console.log(`    Current owner: ${bcOwner} (acquired via marketplace)`);
          }

          if (bc.licenseType === 'transfer') {
            console.log(`    Copyright:     ${bcCopyright}`);
          } else {
            console.log(`    Copyright:     ${bcCreator} (creator retained)`);
          }
        } else {
          console.log(`  ⚠️  PROVENANCE MISMATCH`);
          console.log(`    Watermark says: ${wmCreator}`);
          console.log(`    Blockchain says: ${bcCreator}`);
        }
      }
    } else {
      console.log(`  ⚠️  Cannot verify provenance - no watermark detected`);
    }

    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

  const originals = results.filter(r => r.blockchain.isOriginal && !r.blockchain.parentToken);
  const licenses = results.filter(r => r.blockchain.parentToken !== undefined && r.blockchain.parentToken !== r.tokenId);
  const verified = results.filter(r => r.watermark.detected);

  console.log(`  Total Tokens:     ${results.length}`);
  console.log(`  Original NFTs:    ${originals.length}`);
  console.log(`  License Tokens:   ${licenses.length}`);
  console.log(`  Watermark Verified: ${verified.length} (${Math.round(verified.length / results.length * 100)}%)`);

  // Ownership breakdown
  console.log('\n  CURRENT OWNERSHIP:');
  const ownerCounts = {};
  for (const r of results) {
    const owner = getName(r.blockchain.currentOwner);
    ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
  }
  for (const [owner, count] of Object.entries(ownerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${owner.padEnd(10)} ${count} tokens`);
  }

  // Copyright breakdown
  console.log('\n  COPYRIGHT OWNERSHIP:');
  const copyrightCounts = {};
  for (const r of results) {
    const owner = getName(r.blockchain.copyrightOwner);
    copyrightCounts[owner] = (copyrightCounts[owner] || 0) + 1;
  }
  for (const [owner, count] of Object.entries(copyrightCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${owner.padEnd(10)} ${count} copyrights`);
  }

  console.log('');
}

run().catch(e => console.error('Fatal:', e));
