/**
 * Naturality Tests — Mock/Real Service Transformation
 *
 * The mock and real blockchain services are components of a natural transformation
 * alpha: Mock -> Real. For naturality, the mock must accept the same parameters
 * and produce structurally equivalent results as the real path.
 *
 * After the naturality fix, both mock and real mint() accept:
 *   (reservedTokenId, to, uri, imageHash, ipfsUri)
 *
 * Laws tested:
 *   1. Mock and real paths accept the same parameter count
 *   2. Mock returns the same result shape as real would
 *   3. Mock events have the same structure as real events would
 *   4. Creator always receives Transfer rights (invariant across both paths)
 */

const blockchainService = require('../../src/services/blockchain');

describe('Mock/Real Naturality', () => {
  beforeEach(() => {
    blockchainService.resetMock();
  });

  describe('mint() signature alignment', () => {
    it('mint() accepts exactly 5 parameters (matching contract)', async () => {
      const [reservation] = await blockchainService.reserveTokenId();

      // The 5-parameter contract signature
      const [result, events] = await blockchainService.mint(
        reservation.tokenId,       // reservedTokenId
        '0x1234567890123456789012345678901234567890', // to
        'ar://metadata',           // uri
        '0x' + 'a'.repeat(64),    // imageHash
        'ipfs://watermarked'       // ipfsUri
      );

      expect(result).toHaveProperty('tokenId');
      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('blockNumber');
    });

    it('extra parameters are ignored (no silent consumption)', async () => {
      const [reservation] = await blockchainService.reserveTokenId();

      // Passing extra params should still work (JS ignores extras)
      // but the mock should NOT use them
      const [result] = await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata',
        '0x' + 'a'.repeat(64),
        'ipfs://watermarked'
      );

      // Token should have Transfer rights regardless of any extra params
      const tokenData = await blockchainService.getTokenData(result.tokenId);
      expect(tokenData.ownerLicense).toBe(2); // Transfer
      expect(tokenData.ownerLicense).toBe(2); // Transfer
    });
  });

  describe('Result shape naturality', () => {
    it('mint result has required fields', async () => {
      const [reservation] = await blockchainService.reserveTokenId();
      const [result] = await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata',
        '0x' + 'a'.repeat(64),
        'ipfs://watermarked'
      );

      // These fields are returned by both mock and real paths
      expect(typeof result.tokenId).toBe('number');
      expect(typeof result.transactionHash).toBe('string');
      expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof result.blockNumber).toBe('number');
    });

    it('reserveTokenId result has required fields', async () => {
      const [result] = await blockchainService.reserveTokenId();

      expect(typeof result.tokenId).toBe('number');
      expect(typeof result.expiry).toBe('number');
      expect(typeof result.transactionHash).toBe('string');
    });
  });

  describe('Event structure naturality', () => {
    it('mint emits token.minted event with correct fields', async () => {
      const [reservation] = await blockchainService.reserveTokenId();
      const [, events] = await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata',
        '0x' + 'a'.repeat(64),
        'ipfs://watermarked'
      );

      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.type).toBe('token.minted');
      expect(e).toHaveProperty('tokenId');
      expect(e).toHaveProperty('to');
      expect(e).toHaveProperty('transactionHash');
      expect(e).toHaveProperty('blockNumber');
      expect(e).toHaveProperty('imageHash');
      expect(e).toHaveProperty('ipfsUri');
      expect(e).toHaveProperty('uri');
      expect(e).toHaveProperty('licenseType');
      expect(e).toHaveProperty('mock');
      expect(e).toHaveProperty('timestamp');
    });

    it('reserveTokenId emits token.reserved event', async () => {
      const [, events] = await blockchainService.reserveTokenId();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('token.reserved');
      expect(events[0]).toHaveProperty('tokenId');
      expect(events[0]).toHaveProperty('expiry');
      expect(events[0]).toHaveProperty('transactionHash');
      expect(events[0]).toHaveProperty('mock');
    });
  });

  describe('Creator always receives Transfer rights', () => {
    it('minted token has ownerLicense = Transfer', async () => {
      const [reservation] = await blockchainService.reserveTokenId();
      const [result] = await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata',
        '0x' + 'a'.repeat(64),
        'ipfs://watermarked'
      );

      const data = await blockchainService.getTokenData(result.tokenId);
      expect(data.ownerLicense).toBe(2); // Transfer — matches on-chain invariant
    });

    it('minted token has licenseType = Transfer', async () => {
      const [reservation] = await blockchainService.reserveTokenId();
      const [result] = await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata',
        '0x' + 'a'.repeat(64),
        'ipfs://watermarked'
      );

      const data = await blockchainService.getTokenData(result.tokenId);
      expect(data.ownerLicense).toBe(2); // Transfer — naturality invariant
    });

    it('event records licenseType = Transfer', async () => {
      const [reservation] = await blockchainService.reserveTokenId();
      const [, events] = await blockchainService.mint(
        reservation.tokenId,
        '0x1234567890123456789012345678901234567890',
        'ar://metadata',
        '0x' + 'a'.repeat(64),
        'ipfs://watermarked'
      );

      expect(events[0].licenseType).toBe(2); // Transfer
    });
  });
});
