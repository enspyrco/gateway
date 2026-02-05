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

module.exports = {
  LICENSE_TYPE_MAP,
  LICENSE_TYPE_NAMES,
  parseLicenseType,
  getLicenseTypeName,
  buildListingsArray,
  hasAnyListing
};
