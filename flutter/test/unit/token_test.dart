import 'package:flutter_test/flutter_test.dart';
import 'package:nftmarket/models/token.dart';

void main() {
  group('LicenseType', () {
    test('has correct indices for contract', () {
      expect(LicenseType.display.index, equals(0));
      expect(LicenseType.commercial.index, equals(1));
      expect(LicenseType.transfer.index, equals(2));
    });

    test('has display names', () {
      expect(LicenseType.display.displayName, equals('Display'));
      expect(LicenseType.commercial.displayName, equals('Commercial'));
      expect(LicenseType.transfer.displayName, equals('Full Transfer'));
    });

    test('has descriptions', () {
      expect(LicenseType.display.description, contains('Personal'));
      expect(LicenseType.commercial.description, contains('Commercial'));
      expect(LicenseType.transfer.description, contains('copyright'));
    });

    test('fromString parses correctly', () {
      expect(LicenseType.fromString('display'), equals(LicenseType.display));
      expect(
          LicenseType.fromString('commercial'), equals(LicenseType.commercial));
      expect(LicenseType.fromString('transfer'), equals(LicenseType.transfer));
      expect(LicenseType.fromString('DISPLAY'), equals(LicenseType.display));
    });

    test('fromString returns display for unknown', () {
      expect(LicenseType.fromString('unknown'), equals(LicenseType.display));
    });
  });

  group('Token', () {
    test('creates from JSON', () {
      final json = {
        'tokenId': 1,
        'name': 'Test NFT',
        'description': 'A test token',
        'previewUrl': 'https://example.com/preview.jpg',
        'creator': '0x1234567890123456789012345678901234567890',
        'currentOwner': '0x0987654321098765432109876543210987654321',
        'mintedAt': '2024-01-15T10:30:00Z',
        'watermarkId': '0x1234:1',
        'transactionHash': '0xabcdef',
      };

      final token = Token.fromJson(json);
      expect(token.tokenId, equals(1));
      expect(token.name, equals('Test NFT'));
      expect(token.description, equals('A test token'));
      expect(
          token.creator, equals('0x1234567890123456789012345678901234567890'));
      expect(token.watermarkId, equals('0x1234:1'));
    });

    test('handles missing optional fields', () {
      final json = {
        'tokenId': 1,
        'creator': '0x1234567890123456789012345678901234567890',
        'currentOwner': '0x1234567890123456789012345678901234567890',
        'mintedAt': '2024-01-15T10:30:00Z',
      };

      final token = Token.fromJson(json);
      expect(token.name, equals('Untitled'));
      expect(token.description, equals(''));
      expect(token.previewUrl, isNull);
      expect(token.watermarkId, isNull);
    });

    test('isOwnedBy compares addresses case-insensitively', () {
      final token = Token(
        tokenId: 1,
        name: 'Test',
        creator: '0xABC',
        currentOwner: '0xDEF123',
        mintedAt: DateTime.now(),
      );

      expect(token.isOwnedBy('0xDEF123'), isTrue);
      expect(token.isOwnedBy('0xdef123'), isTrue);
      expect(token.isOwnedBy('0xDEF124'), isFalse);
    });

    test('toJson round-trips correctly', () {
      final original = Token(
        tokenId: 42,
        name: 'My NFT',
        description: 'Description here',
        creator: '0xCreator',
        currentOwner: '0xOwner',
        mintedAt: DateTime.utc(2024, 1, 15, 10, 30),
        watermarkId: '0xCreator:42',
      );

      final json = original.toJson();
      final restored = Token.fromJson(json);

      expect(restored.tokenId, equals(original.tokenId));
      expect(restored.name, equals(original.name));
      expect(restored.description, equals(original.description));
      expect(restored.watermarkId, equals(original.watermarkId));
    });
  });

  group('MintResult', () {
    test('creates from success JSON', () {
      final json = {
        'success': true,
        'tokenId': 5,
        'transactionHash': '0x123abc',
        'watermarkId': '0xWallet:5',
        'previewUri': 'ipfs://preview',
        'metadataUri': 'ipfs://metadata',
      };

      final result = MintResult.fromJson(json);
      expect(result.success, isTrue);
      expect(result.tokenId, equals(5));
      expect(result.transactionHash, equals('0x123abc'));
      expect(result.watermarkId, equals('0xWallet:5'));
    });

    test('creates error result', () {
      final result = MintResult.error('Minting failed');
      expect(result.success, isFalse);
      expect(result.error, equals('Minting failed'));
      expect(result.tokenId, isNull);
    });
  });
}
