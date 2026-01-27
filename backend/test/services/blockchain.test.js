/**
 * Blockchain Service Tests
 */

const blockchainService = require('../../src/services/blockchain');

describe('Blockchain Service (Mock Mode)', () => {
  beforeEach(() => {
    blockchainService.resetMock();
  });

  describe('mint', () => {
    const mockMintParams = {
      to: '0x1234567890123456789012345678901234567890',
      uri: 'ipfs://QmTestMetadata',
      licenseType: 0,
      imageHash: '0x' + 'a'.repeat(64),
      licenseHash: '0x' + 'b'.repeat(64),
      encryptedBlobUri: 'ipfs://QmTestEncrypted'
    };

    it('should mint an NFT and return tokenId', async () => {
      const result = await blockchainService.mint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.licenseType,
        mockMintParams.imageHash,
        mockMintParams.licenseHash,
        mockMintParams.encryptedBlobUri
      );

      expect(result).toHaveProperty('tokenId');
      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('blockNumber');
      expect(result.tokenId).toBe(1);
      expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should increment tokenId for multiple mints', async () => {
      const result1 = await blockchainService.mint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.licenseType,
        '0x' + '1'.repeat(64),
        mockMintParams.licenseHash,
        mockMintParams.encryptedBlobUri
      );

      const result2 = await blockchainService.mint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.licenseType,
        '0x' + '2'.repeat(64),
        mockMintParams.licenseHash,
        mockMintParams.encryptedBlobUri
      );

      expect(result1.tokenId).toBe(1);
      expect(result2.tokenId).toBe(2);
    });

    it('should reject duplicate image hash', async () => {
      await blockchainService.mint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.licenseType,
        mockMintParams.imageHash,
        mockMintParams.licenseHash,
        mockMintParams.encryptedBlobUri
      );

      await expect(
        blockchainService.mint(
          mockMintParams.to,
          mockMintParams.uri,
          mockMintParams.licenseType,
          mockMintParams.imageHash, // Same hash
          mockMintParams.licenseHash,
          mockMintParams.encryptedBlobUri
        )
      ).rejects.toThrow('Image already registered');
    });

    it('should store token data correctly', async () => {
      const { tokenId } = await blockchainService.mint(
        mockMintParams.to,
        mockMintParams.uri,
        mockMintParams.licenseType,
        mockMintParams.imageHash,
        mockMintParams.licenseHash,
        mockMintParams.encryptedBlobUri
      );

      const tokens = blockchainService.getMockTokens();
      const token = tokens.get(tokenId);

      expect(token.creator).toBe(mockMintParams.to);
      expect(token.currentOwner).toBe(mockMintParams.to);
      expect(token.licenseType).toBe(mockMintParams.licenseType);
      expect(token.imageHash).toBe(mockMintParams.imageHash);
      expect(token.uri).toBe(mockMintParams.uri);
    });
  });

  describe('isOwner', () => {
    it('should return true for token owner', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const { tokenId } = await blockchainService.mint(
        wallet,
        'ipfs://test',
        0,
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://encrypted'
      );

      const isOwner = await blockchainService.isOwner(tokenId, wallet);
      expect(isOwner).toBe(true);
    });

    it('should return false for non-owner', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const otherWallet = '0x0987654321098765432109876543210987654321';

      const { tokenId } = await blockchainService.mint(
        wallet,
        'ipfs://test',
        0,
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://encrypted'
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
      const { tokenId } = await blockchainService.mint(
        wallet,
        'ipfs://test',
        0,
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://encrypted'
      );

      const isOwner = await blockchainService.isOwner(tokenId, wallet.toLowerCase());
      expect(isOwner).toBe(true);
    });
  });

  describe('getTokenData', () => {
    it('should return token data', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const { tokenId } = await blockchainService.mint(
        wallet,
        'ipfs://metadata',
        1, // commercial
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://encrypted'
      );

      const data = await blockchainService.getTokenData(tokenId);

      expect(data.creator).toBe(wallet);
      expect(data.currentOwner).toBe(wallet);
      expect(data.licenseType).toBe(1);
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
      await blockchainService.mint(
        '0x1234567890123456789012345678901234567890',
        'ipfs://test',
        0,
        imageHash,
        '0x' + 'b'.repeat(64),
        'ipfs://encrypted'
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
        await blockchainService.mint(
          '0x1234567890123456789012345678901234567890',
          'ipfs://test',
          0,
          '0x' + i.toString().repeat(64),
          '0x' + 'b'.repeat(64),
          'ipfs://encrypted'
        );
      }

      const supply = await blockchainService.totalSupply();
      expect(supply).toBe(3);
    });
  });

  describe('resetMock', () => {
    it('should clear all tokens and reset counter', async () => {
      await blockchainService.mint(
        '0x1234567890123456789012345678901234567890',
        'ipfs://test',
        0,
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        'ipfs://encrypted'
      );

      expect(await blockchainService.totalSupply()).toBe(1);

      blockchainService.resetMock();

      expect(await blockchainService.totalSupply()).toBe(0);

      // Next mint should get tokenId 1 again
      const { tokenId } = await blockchainService.mint(
        '0x1234567890123456789012345678901234567890',
        'ipfs://test',
        0,
        '0x' + 'b'.repeat(64),
        '0x' + 'c'.repeat(64),
        'ipfs://encrypted'
      );
      expect(tokenId).toBe(1);
    });
  });
});
