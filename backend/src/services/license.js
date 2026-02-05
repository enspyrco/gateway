/**
 * License Service
 * Generates and stores license documents on Arweave
 *
 * Based on a16z "Can't Be Evil" NFT license framework:
 * https://a16zcrypto.com/posts/article/introducing-nft-licenses/
 *
 * License Types:
 * - Display (CBE-PERSONAL): Personal, non-commercial use only
 * - Commercial (CBE-COMMERCIAL): Commercial use rights, creator retains copyright
 * - Transfer (CBE-EXCLUSIVE): Full copyright transfer to buyer
 */

const crypto = require('crypto');
const arweaveService = require('./arweave');

// License type enum (matches smart contract)
const LicenseType = {
  Display: 0,
  Commercial: 1,
  Transfer: 2
};

const LicenseNames = {
  [LicenseType.Display]: 'CBE-PERSONAL',
  [LicenseType.Commercial]: 'CBE-COMMERCIAL',
  [LicenseType.Transfer]: 'CBE-EXCLUSIVE'
};

/**
 * Generate a Display license document (CBE-PERSONAL)
 * Personal, non-commercial display only
 */
function generateDisplayLicense({ tokenId, tokenName, creator, buyer, imageHash, salePrice, timestamp }) {
  return {
    license: {
      type: 'CBE-PERSONAL',
      version: '1.0',
      name: "Can't Be Evil - Personal License",
      spdxIdentifier: 'CBE-PERSONAL-1.0'
    },
    artwork: {
      tokenId,
      name: tokenName,
      imageHash,
      platform: 'NFTmarket'
    },
    parties: {
      licensor: {
        address: creator,
        role: 'Creator/Copyright Owner'
      },
      licensee: {
        address: buyer,
        role: 'NFT Owner'
      }
    },
    transaction: {
      price: salePrice,
      currency: 'ETH',
      timestamp,
      chainId: process.env.CHAIN_ID || 137
    },
    rights: {
      display: true,
      commercialUse: false,
      derivative: false,
      sublicense: false,
      transfer: true // Can transfer NFT (and this license) to others
    },
    terms: `
PERSONAL LICENSE AGREEMENT

This Personal License Agreement ("Agreement") is entered into as of ${new Date(timestamp).toISOString()}
between the Licensor and Licensee identified above.

1. GRANT OF LICENSE
   The Licensor grants to Licensee a worldwide, non-exclusive, royalty-free license to:
   - Display the Artwork for personal, non-commercial purposes
   - Display the Artwork in virtual galleries, social media, and personal websites
   - Transfer the NFT (and this license) to third parties

2. RESTRICTIONS
   Licensee shall NOT:
   - Use the Artwork for any commercial purpose
   - Create derivative works based on the Artwork
   - Sublicense, sell, or distribute copies of the Artwork
   - Remove or alter any copyright notices
   - Use the Artwork in any way that infringes the Licensor's moral rights

3. COPYRIGHT
   The Licensor retains all copyright and intellectual property rights in the Artwork.
   This license does not transfer ownership of the underlying intellectual property.

4. TERMINATION
   This license automatically terminates if Licensee:
   - Transfers the NFT to another party (license transfers with NFT)
   - Violates any terms of this Agreement

5. GOVERNING LAW
   This Agreement shall be governed by applicable international copyright law.

6. BLOCKCHAIN VERIFICATION
   This agreement is cryptographically signed by both parties using EIP-712 typed data
   signatures and recorded on the blockchain. The signatures constitute valid electronic
   signatures under applicable law.
`.trim(),
    signatures: {
      note: 'Signatures are recorded on-chain via EIP-712 typed data signing',
      sellerSignatureType: 'ListingOffer',
      buyerSignatureType: 'PurchaseAcceptance'
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: 'NFTmarket License Service v1.0'
    }
  };
}

/**
 * Generate a Commercial license document (CBE-COMMERCIAL)
 * Commercial use rights, creator retains copyright
 */
function generateCommercialLicense({ tokenId, tokenName, creator, buyer, imageHash, salePrice, timestamp }) {
  return {
    license: {
      type: 'CBE-COMMERCIAL',
      version: '1.0',
      name: "Can't Be Evil - Commercial License",
      spdxIdentifier: 'CBE-COMMERCIAL-1.0'
    },
    artwork: {
      tokenId,
      name: tokenName,
      imageHash,
      platform: 'NFTmarket'
    },
    parties: {
      licensor: {
        address: creator,
        role: 'Creator/Copyright Owner'
      },
      licensee: {
        address: buyer,
        role: 'NFT Owner'
      }
    },
    transaction: {
      price: salePrice,
      currency: 'ETH',
      timestamp,
      chainId: process.env.CHAIN_ID || 137
    },
    rights: {
      display: true,
      commercialUse: true,
      derivative: true, // Can create derivatives for commercial use
      sublicense: false, // Cannot sublicense to others
      transfer: true
    },
    terms: `
COMMERCIAL LICENSE AGREEMENT

This Commercial License Agreement ("Agreement") is entered into as of ${new Date(timestamp).toISOString()}
between the Licensor and Licensee identified above.

1. GRANT OF LICENSE
   The Licensor grants to Licensee a worldwide, non-exclusive, royalty-free license to:
   - Display the Artwork publicly and privately
   - Use the Artwork for commercial purposes including:
     * Merchandise (physical and digital)
     * Marketing and advertising
     * Commercial publications
   - Create derivative works based on the Artwork
   - Transfer the NFT (and this license) to third parties

2. RESTRICTIONS
   Licensee shall NOT:
   - Sublicense the Artwork to third parties
   - Register trademarks based on the Artwork
   - Use the Artwork in a way that implies endorsement by the Licensor
   - Remove or alter any copyright notices
   - Use the Artwork in any way that infringes the Licensor's moral rights

3. COPYRIGHT
   The Licensor retains all copyright and intellectual property rights in the Artwork.
   This license grants usage rights but does not transfer ownership of the underlying
   intellectual property.

4. TERMINATION
   This license automatically terminates if Licensee:
   - Transfers the NFT to another party (license transfers with NFT)
   - Violates any terms of this Agreement

5. LIMITATION OF LIABILITY
   The Artwork is provided "as is" without warranty of any kind.

6. GOVERNING LAW
   This Agreement shall be governed by applicable international copyright law.

7. BLOCKCHAIN VERIFICATION
   This agreement is cryptographically signed by both parties using EIP-712 typed data
   signatures and recorded on the blockchain.
`.trim(),
    signatures: {
      note: 'Signatures are recorded on-chain via EIP-712 typed data signing',
      sellerSignatureType: 'ListingOffer',
      buyerSignatureType: 'PurchaseAcceptance'
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: 'NFTmarket License Service v1.0'
    }
  };
}

/**
 * Generate a Transfer license document (CBE-EXCLUSIVE)
 * Full copyright transfer - buyer becomes new copyright owner
 */
function generateTransferLicense({ tokenId, tokenName, creator, seller, buyer, imageHash, salePrice, timestamp }) {
  const isCreatorSelling = creator.toLowerCase() === seller.toLowerCase();

  return {
    license: {
      type: 'CBE-EXCLUSIVE',
      version: '1.0',
      name: "Can't Be Evil - Exclusive/Transfer License",
      spdxIdentifier: 'CBE-EXCLUSIVE-1.0'
    },
    artwork: {
      tokenId,
      name: tokenName,
      imageHash,
      platform: 'NFTmarket'
    },
    parties: {
      seller: {
        address: seller,
        role: isCreatorSelling ? 'Original Creator/Copyright Owner' : 'Current Copyright Owner'
      },
      buyer: {
        address: buyer,
        role: 'New Copyright Owner'
      },
      originalCreator: {
        address: creator,
        role: 'Original Creator (retains moral rights and display license)',
        retainsDisplayRights: true
      }
    },
    transaction: {
      price: salePrice,
      currency: 'ETH',
      timestamp,
      chainId: process.env.CHAIN_ID || 137
    },
    rights: {
      copyrightTransfer: true,
      display: true,
      commercialUse: true,
      derivative: true,
      sublicense: true,
      exclusiveRights: true
    },
    sellerRetainedRights: {
      display: true, // Seller retains personal display rights
      commercialUse: false,
      derivative: false,
      note: 'Seller retains non-exclusive personal display rights per smart contract'
    },
    terms: `
COPYRIGHT TRANSFER AGREEMENT

This Copyright Transfer Agreement ("Agreement") is entered into as of ${new Date(timestamp).toISOString()}
between the Seller and Buyer identified above.

1. TRANSFER OF COPYRIGHT
   The Seller hereby transfers, assigns, and conveys to the Buyer all right, title, and
   interest in and to the Artwork, including but not limited to:
   - All copyrights and intellectual property rights
   - The right to reproduce, distribute, and display the Artwork
   - The right to create derivative works
   - The right to sublicense the Artwork to third parties
   - The right to register copyrights and trademarks

2. SELLER'S RETAINED RIGHTS
   Notwithstanding the transfer above, the Seller retains a perpetual, non-exclusive,
   non-transferable license to display the Artwork for personal, non-commercial purposes.
   This retained right is automatically recorded on the blockchain.

3. ORIGINAL CREATOR'S MORAL RIGHTS
   The Original Creator (${creator}) retains:
   - The right to be identified as the creator of the Artwork
   - Personal display rights (moral rights)

4. WARRANTIES
   The Seller warrants that:
   - They are the lawful owner of the copyright being transferred
   - The Artwork does not infringe any third-party rights
   - There are no encumbrances on the rights being transferred

5. CONSIDERATION
   The transfer is made in consideration of ${salePrice} ETH, receipt of which is
   acknowledged and verified on the blockchain.

6. INDEMNIFICATION
   The Seller agrees to indemnify the Buyer against any claims arising from breach
   of the warranties above.

7. GOVERNING LAW
   This Agreement shall be governed by applicable international copyright law.

8. BLOCKCHAIN VERIFICATION
   This agreement is cryptographically signed by both parties using EIP-712 typed data
   signatures. The copyright transfer is recorded on the blockchain and is legally binding.

9. ENTIRE AGREEMENT
   This Agreement constitutes the entire agreement between the parties regarding the
   transfer of copyright in the Artwork.
`.trim(),
    signatures: {
      note: 'Signatures are recorded on-chain via EIP-712 typed data signing',
      sellerSignatureType: 'ListingOffer',
      buyerSignatureType: 'PurchaseAcceptance'
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: 'NFTmarket License Service v1.0'
    }
  };
}

/**
 * Generate a license document based on license type
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {Object} params - License parameters
 * @returns {Object} - License document
 */
function generateLicense(licenseType, params) {
  switch (licenseType) {
    case LicenseType.Display:
      return generateDisplayLicense(params);
    case LicenseType.Commercial:
      return generateCommercialLicense(params);
    case LicenseType.Transfer:
      return generateTransferLicense(params);
    default:
      throw new Error(`Unknown license type: ${licenseType}`);
  }
}

/**
 * Create and store a license document on Arweave
 * @param {Object} params - License parameters
 * @returns {Promise<{arweaveTxId: string, licenseHash: string, license: Object}>}
 */
async function createLicense({
  tokenId,
  tokenName,
  licenseType,
  creator,
  seller,
  buyer,
  imageHash,
  salePrice,
  timestamp
}) {
  // Generate the license document
  const license = generateLicense(licenseType, {
    tokenId,
    tokenName,
    creator,
    seller: seller || creator,
    buyer,
    imageHash,
    salePrice,
    timestamp: timestamp || Date.now()
  });

  // Calculate the license hash (this goes on-chain)
  const licenseJson = JSON.stringify(license);
  const licenseHash = '0x' + crypto.createHash('sha256').update(licenseJson).digest('hex');

  // Upload to Arweave
  const { txId } = await arweaveService.uploadJson(license, {
    'License-Type': LicenseNames[licenseType],
    'Token-ID': String(tokenId),
    'Creator': creator,
    'Buyer': buyer,
    'Image-Hash': imageHash
  });

  console.log(`[License] Created ${LicenseNames[licenseType]} license for token ${tokenId}`);
  console.log(`[License] Arweave TX: ${txId}`);
  console.log(`[License] Hash: ${licenseHash}`);

  return {
    arweaveTxId: txId,
    arweaveUrl: arweaveService.getGatewayUrl(txId),
    licenseHash,
    licenseType,
    licenseTypeName: LicenseNames[licenseType],
    license
  };
}

/**
 * Verify a license document against its hash
 * @param {string} arweaveTxId - Arweave transaction ID
 * @param {string} expectedHash - Expected license hash (from blockchain)
 * @returns {Promise<{valid: boolean, license: Object|null}>}
 */
async function verifyLicense(arweaveTxId, expectedHash) {
  try {
    const isValid = await arweaveService.verifyHash(arweaveTxId, expectedHash);

    if (!isValid) {
      return { valid: false, license: null, error: 'Hash mismatch' };
    }

    const data = await arweaveService.fetchData(arweaveTxId);
    const license = JSON.parse(data.toString());

    return { valid: true, license };
  } catch (error) {
    return { valid: false, license: null, error: error.message };
  }
}

/**
 * Get license type name
 */
function getLicenseTypeName(licenseType) {
  return LicenseNames[licenseType] || 'Unknown';
}

module.exports = {
  LicenseType,
  LicenseNames,
  generateLicense,
  createLicense,
  verifyLicense,
  getLicenseTypeName
};
