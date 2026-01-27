/**
 * Marketplace Service Tests
 */

const blockchainService = require('../../src/services/blockchain');

describe('Marketplace (Mock Mode)', () => {
  const userA = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const userB = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

  beforeEach(() => {
    blockchainService.resetMock();
  });

  async function mintToken(owner) {
    return blockchainService.mint(
      owner,
      'ipfs://metadata',
      0,
      '0x' + Math.random().toString(16).slice(2).padEnd(64, '0'),
      '0x' + 'b'.repeat(64),
      'ipfs://encrypted'
    );
  }

  describe('listToken', () => {
    it('should list a token for sale', async () => {
      const { tokenId } = await mintToken(userA);

      const result = await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      expect(result.tokenId).toBe(tokenId);
      expect(result.price).toBe('1000000000000000000');
    });

    it('should reject listing by non-owner', async () => {
      const { tokenId } = await mintToken(userA);

      await expect(
        blockchainService.listToken(tokenId, '1000000000000000000', userB)
      ).rejects.toThrow('Not token owner');
    });

    it('should reject listing non-existent token', async () => {
      await expect(
        blockchainService.listToken(999, '1000000000000000000', userA)
      ).rejects.toThrow('Token does not exist');
    });

    it('should reject double listing', async () => {
      const { tokenId } = await mintToken(userA);

      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      await expect(
        blockchainService.listToken(tokenId, '2000000000000000000', userA)
      ).rejects.toThrow('Already listed');
    });
  });

  describe('getListing', () => {
    it('should return listing info for listed token', async () => {
      const { tokenId } = await mintToken(userA);
      const price = '1000000000000000000';

      await blockchainService.listToken(tokenId, price, userA);

      const listing = await blockchainService.getListing(tokenId);

      expect(listing.seller).toBe(userA);
      expect(listing.price).toBe(price);
      expect(listing.active).toBe(true);
    });

    it('should return inactive for unlisted token', async () => {
      const { tokenId } = await mintToken(userA);

      const listing = await blockchainService.getListing(tokenId);

      expect(listing.active).toBe(false);
    });
  });

  describe('delistToken', () => {
    it('should remove a listing', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      await blockchainService.delistToken(tokenId, userA);

      const listing = await blockchainService.getListing(tokenId);
      expect(listing.active).toBe(false);
    });

    it('should reject delist by non-seller', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      await expect(
        blockchainService.delistToken(tokenId, userB)
      ).rejects.toThrow('Not the seller');
    });

    it('should reject delist of unlisted token', async () => {
      const { tokenId } = await mintToken(userA);

      await expect(
        blockchainService.delistToken(tokenId, userA)
      ).rejects.toThrow('Not listed');
    });
  });

  describe('buyToken', () => {
    it('should transfer ownership on purchase', async () => {
      const { tokenId } = await mintToken(userA);
      const price = '1000000000000000000';

      await blockchainService.listToken(tokenId, price, userA);

      const result = await blockchainService.buyToken(tokenId, userB);

      expect(result.seller).toBe(userA);
      expect(result.buyer).toBe(userB);
      expect(result.price).toBe(price);

      // Verify ownership changed
      const isOwner = await blockchainService.isOwner(tokenId, userB);
      expect(isOwner).toBe(true);

      const wasOwner = await blockchainService.isOwner(tokenId, userA);
      expect(wasOwner).toBe(false);
    });

    it('should remove listing after purchase', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      await blockchainService.buyToken(tokenId, userB);

      const listing = await blockchainService.getListing(tokenId);
      expect(listing.active).toBe(false);
    });

    it('should reject buying own token', async () => {
      const { tokenId } = await mintToken(userA);
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      await expect(
        blockchainService.buyToken(tokenId, userA)
      ).rejects.toThrow('Cannot buy own token');
    });

    it('should reject buying unlisted token', async () => {
      const { tokenId } = await mintToken(userA);

      await expect(
        blockchainService.buyToken(tokenId, userB)
      ).rejects.toThrow('Not listed');
    });
  });

  describe('getActiveListings', () => {
    it('should return empty array when no listings', async () => {
      const listings = await blockchainService.getActiveListings();
      expect(listings).toEqual([]);
    });

    it('should return all active listings', async () => {
      const { tokenId: token1 } = await mintToken(userA);
      const { tokenId: token2 } = await mintToken(userA);
      const { tokenId: token3 } = await mintToken(userB);

      await blockchainService.listToken(token1, '1000000000000000000', userA);
      await blockchainService.listToken(token2, '2000000000000000000', userA);
      // token3 not listed

      const listings = await blockchainService.getActiveListings();

      expect(listings.length).toBe(2);
      expect(listings.map(l => l.tokenId)).toContain(token1);
      expect(listings.map(l => l.tokenId)).toContain(token2);
    });

    it('should not include delisted tokens', async () => {
      const { tokenId } = await mintToken(userA);

      await blockchainService.listToken(tokenId, '1000000000000000000', userA);
      await blockchainService.delistToken(tokenId, userA);

      const listings = await blockchainService.getActiveListings();
      expect(listings.length).toBe(0);
    });

    it('should not include sold tokens', async () => {
      const { tokenId } = await mintToken(userA);

      await blockchainService.listToken(tokenId, '1000000000000000000', userA);
      await blockchainService.buyToken(tokenId, userB);

      const listings = await blockchainService.getActiveListings();
      expect(listings.length).toBe(0);
    });
  });

  describe('full marketplace flow', () => {
    it('should support mint -> list -> buy -> relist cycle', async () => {
      // User A mints
      const { tokenId } = await mintToken(userA);
      expect(await blockchainService.isOwner(tokenId, userA)).toBe(true);

      // User A lists for 1 ETH
      await blockchainService.listToken(tokenId, '1000000000000000000', userA);

      // User B buys
      await blockchainService.buyToken(tokenId, userB);
      expect(await blockchainService.isOwner(tokenId, userB)).toBe(true);
      expect(await blockchainService.isOwner(tokenId, userA)).toBe(false);

      // User B relists for 2 ETH
      await blockchainService.listToken(tokenId, '2000000000000000000', userB);

      const listing = await blockchainService.getListing(tokenId);
      expect(listing.seller).toBe(userB);
      expect(listing.price).toBe('2000000000000000000');
    });
  });
});
