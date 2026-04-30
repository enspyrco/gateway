/**
 * Shared license type utilities
 * Centralizes license type validation and conversion used across marketplace routes
 */

const LICENSE_TYPE_MAP = {
  display: 0,
  commercial: 1,
  transfer: 2
};

const LICENSE_TYPE_NAMES = ['display', 'commercial', 'transfer'];

/**
 * Parse license type from string or number to number
 * @param {string|number} licenseType - License type as string ('display', 'commercial', 'transfer') or number (0, 1, 2)
 * @returns {{ valid: boolean, licenseTypeNum: number|null, error: string|null }}
 */
function parseLicenseType(licenseType) {
  if (licenseType === undefined || licenseType === null) {
    return { valid: false, licenseTypeNum: null, error: 'Missing licenseType' };
  }

  let licenseTypeNum;
  if (typeof licenseType === 'string') {
    licenseTypeNum = LICENSE_TYPE_MAP[licenseType.toLowerCase()];
  } else if (typeof licenseType === 'number') {
    licenseTypeNum = licenseType;
  }

  if (licenseTypeNum === undefined || licenseTypeNum < 0 || licenseTypeNum > 2) {
    return { valid: false, licenseTypeNum: null, error: 'Invalid licenseType. Must be: display, commercial, or transfer' };
  }

  return { valid: true, licenseTypeNum, error: null };
}

/**
 * Get license type name from number
 * @param {number} licenseTypeNum - License type number (0, 1, 2)
 * @returns {string} License type name
 */
function getLicenseTypeName(licenseTypeNum) {
  return LICENSE_TYPE_NAMES[licenseTypeNum] || 'unknown';
}

/**
 * Build listings array from allListings object
 * Used by gallery.js and marketplace.js to format multi-license listings
 * @param {Object} allListings - Object with display, commercial, transfer properties
 * @param {boolean} includeDetails - Whether to include seller, nonce, expiry, licenseHash
 * @returns {Array} Array of listing objects
 */
function buildListingsArray(allListings, includeDetails = false) {
  const listings = [];

  if (allListings.display && allListings.display.active) {
    const listing = {
      licenseType: 'display',
      price: allListings.display.price,
      priceEth: (Number(allListings.display.price) / 1e18).toFixed(4)
    };
    if (includeDetails) {
      listing.seller = allListings.display.seller;
      listing.nonce = allListings.display.nonce;
      listing.expiry = allListings.display.expiry;
      listing.licenseHash = allListings.display.licenseHash;
    }
    listings.push(listing);
  }

  if (allListings.commercial && allListings.commercial.active) {
    const listing = {
      licenseType: 'commercial',
      price: allListings.commercial.price,
      priceEth: (Number(allListings.commercial.price) / 1e18).toFixed(4)
    };
    if (includeDetails) {
      listing.seller = allListings.commercial.seller;
      listing.nonce = allListings.commercial.nonce;
      listing.expiry = allListings.commercial.expiry;
      listing.licenseHash = allListings.commercial.licenseHash;
    }
    listings.push(listing);
  }

  if (allListings.transfer && allListings.transfer.active) {
    const listing = {
      licenseType: 'transfer',
      price: allListings.transfer.price,
      priceEth: (Number(allListings.transfer.price) / 1e18).toFixed(4)
    };
    if (includeDetails) {
      listing.seller = allListings.transfer.seller;
      listing.nonce = allListings.transfer.nonce;
      listing.expiry = allListings.transfer.expiry;
      listing.licenseHash = allListings.transfer.licenseHash;
    }
    listings.push(listing);
  }

  return listings;
}

/**
 * Check if any license type is listed
 * @param {Object} allListings - Object with display, commercial, transfer properties
 * @returns {boolean}
 */
function hasAnyListing(allListings) {
  return (
    (allListings.display && allListings.display.active) ||
    (allListings.commercial && allListings.commercial.active) ||
    (allListings.transfer && allListings.transfer.active)
  );
}

// ── License Semilattice Operations ──────────────────────────
//
// License types form a bounded join-semilattice (total order):
//   Display (0) < Commercial (1) < Transfer (2)
//
// These operations centralize the lattice comparisons that appear
// across blockchain.js, marketplace.js, and the Solidity contract.

/**
 * Can the owner sell (list) at the requested license level?
 * Equivalent to: requestedLevel <= ownerLevel in the semilattice.
 * @param {number} ownerLevel - The owner's current license level
 * @param {number} requestedLevel - The license level being sold
 * @returns {boolean}
 */
function canSell(ownerLevel, requestedLevel) {
  return requestedLevel <= ownerLevel;
}

/**
 * Is the requested license an upgrade over the existing one?
 * Equivalent to: existingLevel < requestedLevel in the semilattice.
 * @param {number} existingLevel - The current license level
 * @param {number} requestedLevel - The license level to upgrade to
 * @returns {boolean}
 */
function canUpgrade(existingLevel, requestedLevel) {
  return requestedLevel > existingLevel;
}

/**
 * Join (least upper bound) of two license levels.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function licenseJoin(a, b) {
  return Math.max(a, b);
}

/**
 * Meet (greatest lower bound) of two license levels.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function licenseMeet(a, b) {
  return Math.min(a, b);
}

// ── License Templates ────────────────────────────────────────
// Single source of truth for license agreement text.

const LICENSE_TEMPLATES = {
  display: `NFTMARKET LICENSE AGREEMENT - DISPLAY

This license grants personal, non-commercial display rights only.

You MAY:
- Display the artwork for personal enjoyment
- Resell or transfer the NFT

You MAY NOT:
- Use the artwork commercially
- Create derivative works
- Sublicense the artwork

Copyright remains with the creator.`,

  commercial: `NFTMARKET LICENSE AGREEMENT - COMMERCIAL

This license grants commercial usage rights.

You MAY:
- Display the artwork publicly or privately
- Use the artwork in commercial projects
- Create and sell merchandise
- Create derivative works
- Resell or transfer the NFT (license transfers with it)

You MAY NOT:
- Claim original authorship
- Sublicense independently of the NFT

Copyright remains with the creator. Commercial rights transfer with the NFT.`,

  transfer: `NFTMARKET LICENSE AGREEMENT - COPYRIGHT TRANSFER

This agreement transfers full copyright ownership to you.

You receive:
- Full copyright ownership
- All reproduction rights
- All derivative work rights
- All commercial rights
- Right to sublicense

The creator retains:
- Moral rights (where applicable by law)
- Right to be credited as original author

This is a complete and irrevocable transfer of copyright.`
};

/**
 * Get license template text by type
 * @param {string} type - 'display', 'commercial', or 'transfer'
 * @returns {string|undefined}
 */
function getLicenseTemplate(type) {
  return LICENSE_TEMPLATES[type];
}

module.exports = {
  LICENSE_TYPE_MAP,
  LICENSE_TYPE_NAMES,
  parseLicenseType,
  getLicenseTypeName,
  buildListingsArray,
  hasAnyListing,
  // Semilattice operations
  canSell,
  canUpgrade,
  licenseJoin,
  licenseMeet,
  // Templates
  LICENSE_TEMPLATES,
  getLicenseTemplate,
};
