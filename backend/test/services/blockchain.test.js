/**
 * Blockchain Service Tests
 */

const blockchainService = require('../../src/services/blockchain');

// Helper to reserve and mint (mirrors the contract pattern)
// Contract signature: mint(reservedTokenId, to, uri, imageHash, ipfsUri)
// Returns just the result (not events) for test convenience
async function reserveAndMint(to, uri, imageHash, ipfsUri) {
  const [reservation] = await blockchainService.reserveTokenId();
  const [result] = await blockchainService.mint(
    reservation.tokenId,
    to,
    uri,
    imageHash,
    ipfsUri
  );
  return result;
}

describe('Blockchain Service (Mock Mode)', () => {
  beforeEach(() => {
    blockchainService.resetMock();
  });

  describe('reserveTokenId', () => {
    it('should reserve a token ID', async () => {
      const [result, events] = await blockchainService.reserveTokenId();

      expect(result).toHaveProperty('tokenId');
      expect(result).toHaveProperty('expiry');
      expect(result).toHaveProperty('transactionHash');
      expect(result.tokenId).toBe(0);
      expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('token.reserved');
    });

    it('should increment token IDs for multiple reservations', async () => {
      const [result1] = await blockchainService.reserveTokenId();
      const [result2] = await blockchainService.reserveTokenId();

      expect(result1.tokenId).toBe(0);
      expect(result2.tokenId).toBe(1);
    });
  });

  describe('mint', () => {
    const mockMintParams = {
      to: '0x1234567890123456789012345678901234567890',
      uri: 'ipfs://QmTestMetadata',
      imageHash: '0x' + 'a'.repeat(64),
      ipfsUri: 'ipfs://QmWatermarked',
    };

    it('should mint an NFT with reserved token ID', async () => {
      const result = await reserveAndMint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.imageHash,
        mockMintParams.ipfsUri
      );

      expect(result).toHaveProperty('tokenId');
      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('blockNumber');
      expect(result.tokenId).toBe(0);
      expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should use correct token IDs for multiple mints', async () => {
      const result1 = await reserveAndMint(
        mockMintParams.to,
        mockMintParams.uri,
        '0x' + '1'.repeat(64),
        mockMintParams.ipfsUri
      );

      const result2 = await reserveAndMint(
        mockMintParams.to,
        mockMintParams.uri,
        '0x' + '2'.repeat(64),
        mockMintParams.ipfsUri
      );

      expect(result1.tokenId).toBe(0);
      expect(result2.tokenId).toBe(1);
    });

    it('should reject mint without reservation', async () => {
      await expect(
        blockchainService.mint(
          999, // Non-existent reservation
          mockMintParams.to,
          mockMintParams.uri,
          mockMintParams.imageHash,
          mockMintParams.ipfsUri
        )
      ).rejects.toThrow('No valid reservation');
    });

    it('should reject duplicate image hash', async () => {
      await reserveAndMint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.imageHash,
        mockMintParams.ipfsUri
      );

      await expect(
        reserveAndMint(
          mockMintParams.to,
          mockMintParams.uri,
          mockMintParams.imageHash, // Same hash
          mockMintParams.ipfsUri
        )
      ).rejects.toThrow('Image already registered');
    });

    it('should store token data correctly', async () => {
      const { tokenId } = await reserveAndMint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.imageHash,
        mockMintParams.ipfsUri
      );

      const tokens = blockchainService.getMockTokens();
      const token = tokens.get(tokenId);

      expect(token.creator).toBe(mockMintParams.to);
      expect(token.currentOwner).toBe(mockMintParams.to);
      // Creator always gets Transfer (full) rights — matches on-chain contract
      expect(token.ownerLicense).toBe(2); // Transfer
      expect(token.imageHash).toBe(mockMintParams.imageHash);
      expect(token.uri).toBe(mockMintParams.uri);
    });
  });

  describe('isOwner', () => {
    it('should return true for token owner', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const { tokenId } = await reserveAndMint(
        wallet, 'ipfs://test', '0x' + 'a'.repeat(64), 'ipfs://watermarked'
      );

      const isOwner = await blockchainService.isOwner(tokenId, wallet);
      expect(isOwner).toBe(true);
    });

    it('should return false for non-owner', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const otherWallet = '0x0987654321098765432109876543210987654321';

      const { tokenId } = await reserveAndMint(
        wallet, 'ipfs://test', '0x' + 'a'.repeat(64), 'ipfs://watermarked'
      );

      const isOwner = await blockchainService.isOwner(tokenId, otherWallet);
      expect(isOwner).toBe(false);
    });

    it('should return false for non-existent token', async () => {
      const isOwner = await blockchainService.isOwner(999, '0x1234567890123456789012345678901234567890');
      expect(isOwner).toBe(false);
    });

    it('should be case-insensitive for addresses', async () => {
      const wallet = '0xABCDef1234567890123456789012345678901234';
      const { tokenId } = await reserveAndMint(
        wallet, 'ipfs://test', '0x' + 'a'.repeat(64), 'ipfs://watermarked'
      );

      const isOwner = await blockchainService.isOwner(tokenId, wallet.toLowerCase());
      expect(isOwner).toBe(true);
    });
  });

  describe('getTokenData', () => {
    it('should return token data', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const { tokenId } = await reserveAndMint(
        wallet, 'ipfs://metadata', '0x' + 'a'.repeat(64), 'ipfs://watermarked'
      );

      const data = await blockchainService.getTokenData(tokenId);

      expect(data.creator).toBe(wallet);
      expect(data.currentOwner).toBe(wallet);
      // Creator always gets Transfer rights
      expect(data.ownerLicense).toBe(2);
      expect(data.uri).toBe('ipfs://metadata');
      expect(data.mintedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent token', async () => {
      await expect(blockchainService.getTokenData(999)).rejects.toThrow('Token does not exist');
    });
  });

  describe('isImageRegistered', () => {
    it('should return false for unregistered hash', async () => {
      const result = await blockchainService.isImageRegistered('0x' + 'f'.repeat(64));
      expect(result).toBe(false);
    });

    it('should return true for registered hash', async () => {
      const imageHash = '0x' + 'a'.repeat(64);
      await reserveAndMint(
        '0x1234567890123456789012345678901234567890',
        'ipfs://test', imageHash, 'ipfs://watermarked'
      );

      const result = await blockchainService.isImageRegistered(imageHash);
      expect(result).toBe(true);
    });
  });

  describe('totalSupply', () => {
    it('should return 0 initially', async () => {
      const supply = await blockchainService.totalSupply();
      expect(supply).toBe(0);
    });

    it('should return correct count after minting', async () => {
      for (let i = 0; i < 3; i++) {
        await reserveAndMint(
          '0x1234567890123456789012345678901234567890',
          'ipfs://test', '0x' + i.toString().repeat(64), 'ipfs://watermarked'
        );
      }

      const supply = await blockchainService.totalSupply();
      expect(supply).toBe(3);
    });
  });

  describe('resetMock', () => {
    it('should clear all tokens and reset counter', async () => {
      await reserveAndMint(
        '0x1234567890123456789012345678901234567890',
        'ipfs://test', '0x' + 'a'.repeat(64), 'ipfs://watermarked'
      );

      expect(await blockchainService.totalSupply()).toBe(1);

      blockchainService.resetMock();

      expect(await blockchainService.totalSupply()).toBe(0);

      // Next mint should get tokenId 0 again (after reset)
      const { tokenId } = await reserveAndMint(
        '0x1234567890123456789012345678901234567890',
        'ipfs://test', '0x' + 'b'.repeat(64), 'ipfs://watermarked'
      );
      expect(tokenId).toBe(0);
    });
  });
});
