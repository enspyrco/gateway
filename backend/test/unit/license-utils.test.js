/**
 * Unit tests for license-utils.js
 */

const {
  LICENSE_TYPE_MAP,
  LICENSE_TYPE_NAMES,
  parseLicenseType,
  getLicenseTypeName,
  buildListingsArray,
  hasAnyListing
} = require('../../src/utils/license-utils');

describe('license-utils', () => {

  describe('LICENSE_TYPE_MAP', () => {
    test('maps string names to numbers correctly', () => {
      expect(LICENSE_TYPE_MAP.display).toBe(0);
      expect(LICENSE_TYPE_MAP.commercial).toBe(1);
      expect(LICENSE_TYPE_MAP.transfer).toBe(2);
    });
  });

  describe('LICENSE_TYPE_NAMES', () => {
    test('maps numbers to string names correctly', () => {
      expect(LICENSE_TYPE_NAMES[0]).toBe('display');
      expect(LICENSE_TYPE_NAMES[1]).toBe('commercial');
      expect(LICENSE_TYPE_NAMES[2]).toBe('transfer');
    });
  });

  describe('parseLicenseType', () => {
    test('parses string license types', () => {
      expect(parseLicenseType('display')).toEqual({ valid: true, licenseTypeNum: 0, error: null });
      expect(parseLicenseType('commercial')).toEqual({ valid: true, licenseTypeNum: 1, error: null });
      expect(parseLicenseType('transfer')).toEqual({ valid: true, licenseTypeNum: 2, error: null });
    });

    test('parses string license types case-insensitively', () => {
      expect(parseLicenseType('DISPLAY')).toEqual({ valid: true, licenseTypeNum: 0, error: null });
      expect(parseLicenseType('Commercial')).toEqual({ valid: true, licenseTypeNum: 1, error: null });
      expect(parseLicenseType('TRANSFER')).toEqual({ valid: true, licenseTypeNum: 2, error: null });
    });

    test('parses numeric license types', () => {
      expect(parseLicenseType(0)).toEqual({ valid: true, licenseTypeNum: 0, error: null });
      expect(parseLicenseType(1)).toEqual({ valid: true, licenseTypeNum: 1, error: null });
      expect(parseLicenseType(2)).toEqual({ valid: true, licenseTypeNum: 2, error: null });
    });

    test('rejects undefined/null', () => {
      expect(parseLicenseType(undefined)).toEqual({
        valid: false,
        licenseTypeNum: null,
        error: 'Missing licenseType'
      });
      expect(parseLicenseType(null)).toEqual({
        valid: false,
        licenseTypeNum: null,
        error: 'Missing licenseType'
      });
    });

    test('rejects invalid string values', () => {
      const result = parseLicenseType('invalid');
      expect(result.valid).toBe(false);
      expect(result.licenseTypeNum).toBe(null);
      expect(result.error).toContain('Invalid licenseType');
    });

    test('rejects out-of-range numeric values', () => {
      expect(parseLicenseType(-1).valid).toBe(false);
      expect(parseLicenseType(3).valid).toBe(false);
      expect(parseLicenseType(100).valid).toBe(false);
    });
  });

  describe('getLicenseTypeName', () => {
    test('returns correct names for valid numbers', () => {
      expect(getLicenseTypeName(0)).toBe('display');
      expect(getLicenseTypeName(1)).toBe('commercial');
      expect(getLicenseTypeName(2)).toBe('transfer');
    });

    test('returns "unknown" for invalid numbers', () => {
      expect(getLicenseTypeName(-1)).toBe('unknown');
      expect(getLicenseTypeName(3)).toBe('unknown');
      expect(getLicenseTypeName(100)).toBe('unknown');
    });
  });

  describe('buildListingsArray', () => {
    const mockAllListings = {
      display: {
        active: true,
        price: '100000000000000000', // 0.1 ETH
        seller: '0xAlice',
        nonce: 1,
        expiry: 9999999999,
        licenseHash: '0xabc123'
      },
      commercial: {
        active: true,
        price: '500000000000000000', // 0.5 ETH
        seller: '0xAlice',
        nonce: 2,
        expiry: 9999999999,
        licenseHash: '0xdef456'
      },
      transfer: {
        active: false,
        price: '0'
      }
    };

    test('builds array with active listings only', () => {
      const result = buildListingsArray(mockAllListings, false);
      expect(result).toHaveLength(2);
      expect(result[0].licenseType).toBe('display');
      expect(result[1].licenseType).toBe('commercial');
    });

    test('includes price in ETH', () => {
      const result = buildListingsArray(mockAllListings, false);
      expect(result[0].priceEth).toBe('0.1000');
      expect(result[1].priceEth).toBe('0.5000');
    });

    test('excludes details when includeDetails=false', () => {
      const result = buildListingsArray(mockAllListings, false);
      expect(result[0]).not.toHaveProperty('seller');
      expect(result[0]).not.toHaveProperty('nonce');
      expect(result[0]).not.toHaveProperty('expiry');
      expect(result[0]).not.toHaveProperty('licenseHash');
    });

    test('includes details when includeDetails=true', () => {
      const result = buildListingsArray(mockAllListings, true);
      expect(result[0].seller).toBe('0xAlice');
      expect(result[0].nonce).toBe(1);
      expect(result[0].expiry).toBe(9999999999);
      expect(result[0].licenseHash).toBe('0xabc123');
    });

    test('returns empty array when no active listings', () => {
      const noListings = {
        display: { active: false },
        commercial: { active: false },
        transfer: { active: false }
      };
      expect(buildListingsArray(noListings, false)).toEqual([]);
    });

    test('handles all three license types active', () => {
      const allActive = {
        display: { active: true, price: '100000000000000000' },
        commercial: { active: true, price: '200000000000000000' },
        transfer: { active: true, price: '1000000000000000000' }
      };
      const result = buildListingsArray(allActive, false);
      expect(result).toHaveLength(3);
      expect(result.map(l => l.licenseType)).toEqual(['display', 'commercial', 'transfer']);
    });
  });

  describe('hasAnyListing', () => {
    test('returns true when display is active', () => {
      const listings = {
        display: { active: true },
        commercial: { active: false },
        transfer: { active: false }
      };
      expect(hasAnyListing(listings)).toBe(true);
    });

    test('returns true when commercial is active', () => {
      const listings = {
        display: { active: false },
        commercial: { active: true },
        transfer: { active: false }
      };
      expect(hasAnyListing(listings)).toBe(true);
    });

    test('returns true when transfer is active', () => {
      const listings = {
        display: { active: false },
        commercial: { active: false },
        transfer: { active: true }
      };
      expect(hasAnyListing(listings)).toBe(true);
    });

    test('returns true when multiple are active', () => {
      const listings = {
        display: { active: true },
        commercial: { active: true },
        transfer: { active: false }
      };
      expect(hasAnyListing(listings)).toBe(true);
    });

    test('returns false when none are active', () => {
      const listings = {
        display: { active: false },
        commercial: { active: false },
        transfer: { active: false }
      };
      expect(hasAnyListing(listings)).toBe(false);
    });

    test('handles undefined/null listings gracefully', () => {
      const listings = {
        display: null,
        commercial: undefined,
        transfer: { active: false }
      };
      expect(hasAnyListing(listings)).toBe(false);
    });
  });
});
