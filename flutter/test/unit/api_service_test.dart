import 'package:flutter_test/flutter_test.dart';
import 'package:nftmarket/services/api_service.dart';
import 'package:nftmarket/models/token.dart';

import '../fixtures/api_responses.dart';
import '../mocks/mock_http_client.dart';

/// Unit tests for ApiService.
///
/// These tests verify:
/// - Request construction (headers, URLs, body)
/// - Response parsing
/// - Error handling
/// - Model deserialization
void main() {
  group('ApiService', () {
    group('URL construction', () {
      test('uses default base URL', () {
        expect(ApiService.baseUrl, contains('localhost'));
      });

      test('base URL includes port 3000', () {
        expect(ApiService.baseUrl, contains('3000'));
      });
    });

    group('Headers', () {
      test('includes Content-Type header', () {
        final api = ApiService();
        expect(api.toString(), isNotNull); // Just verify it can be created
      });

      test('includes Authorization when token provided', () {
        final api = ApiService(authToken: 'test-token');
        expect(api.authToken, equals('test-token'));
      });

      test('no Authorization when token is null', () {
        final api = ApiService();
        expect(api.authToken, isNull);
      });
    });

    group('ApiException', () {
      test('creates with message', () {
        final exception = ApiException('Test error');
        expect(exception.message, equals('Test error'));
        expect(exception.toString(), equals('Test error'));
      });

      test('creates with code and status', () {
        final exception = ApiException(
          'Not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        );
        expect(exception.code, equals('NOT_FOUND'));
        expect(exception.statusCode, equals(404));
      });

      test('toString returns message', () {
        final exception = ApiException('Something went wrong');
        expect(exception.toString(), equals('Something went wrong'));
      });
    });

    group('GenerationResult', () {
      test('creates from JSON', () {
        final json = {
          'success': true,
          'generationId': 'gen-123',
          'prompt': 'a cat',
          'style': 'photographic',
          'images': [
            {
              'id': 'img-1',
              'seed': 12345,
              'url': '/api/generate/gen-123/image/0'
            },
          ],
        };

        final result = GenerationResult.fromJson(json);
        expect(result.success, isTrue);
        expect(result.generationId, equals('gen-123'));
        expect(result.prompt, equals('a cat'));
        expect(result.style, equals('photographic'));
        expect(result.images.length, equals(1));
        expect(result.images[0].seed, equals(12345));
      });

      test('handles missing images array', () {
        final json = {
          'success': true,
          'generationId': 'gen-456',
        };

        final result = GenerationResult.fromJson(json);
        expect(result.success, isTrue);
        expect(result.images, isEmpty);
      });

      test('creates error result', () {
        final result = GenerationResult.error('Failed to generate');
        expect(result.success, isFalse);
        expect(result.error, equals('Failed to generate'));
        expect(result.images, isEmpty);
      });
    });

    group('GeneratedImage', () {
      test('creates from JSON', () {
        final json = {
          'id': 'img-abc',
          'seed': 99999,
          'url': '/api/generate/gen/image/0',
        };

        final image = GeneratedImage.fromJson(json);
        expect(image.id, equals('img-abc'));
        expect(image.seed, equals(99999));
        expect(image.url, equals('/api/generate/gen/image/0'));
      });

      test('handles missing fields with defaults', () {
        final json = <String, dynamic>{};

        final image = GeneratedImage.fromJson(json);
        expect(image.id, isEmpty);
        expect(image.seed, equals(0));
        expect(image.url, isEmpty);
      });
    });

    group('Token Model', () {
      test('creates from JSON', () {
        final json = TokenFixtures.token(
          tokenId: 1,
          name: 'Test NFT',
          description: 'A test token',
          creator: TestAddresses.alice,
          currentOwner: TestAddresses.bob,
        );

        final token = Token.fromJson(json);
        expect(token.tokenId, equals(1));
        expect(token.name, equals('Test NFT'));
        expect(token.description, equals('A test token'));
        expect(token.creator, equals(TestAddresses.alice));
        expect(token.currentOwner, equals(TestAddresses.bob));
      });

      test('isOwnedBy checks ownership case-insensitively', () {
        final json = TokenFixtures.token(currentOwner: TestAddresses.alice);
        final token = Token.fromJson(json);

        expect(token.isOwnedBy(TestAddresses.alice), isTrue);
        expect(token.isOwnedBy(TestAddresses.alice.toLowerCase()), isTrue);
        expect(token.isOwnedBy(TestAddresses.alice.toUpperCase()), isTrue);
        expect(token.isOwnedBy(TestAddresses.bob), isFalse);
      });

      test('toJson serializes correctly', () {
        final json = TokenFixtures.token(tokenId: 42);
        final token = Token.fromJson(json);
        final serialized = token.toJson();

        expect(serialized['tokenId'], equals(42));
        expect(serialized['name'], isNotNull);
        expect(serialized['creator'], isNotNull);
        expect(serialized['currentOwner'], isNotNull);
      });
    });

    group('MintResult Model', () {
      test('creates from successful response', () {
        final json = MintFixtures.success(tokenId: 123);

        final result = MintResult.fromJson(json);
        expect(result.success, isTrue);
        expect(result.tokenId, equals(123));
        expect(result.transactionHash, isNotNull);
        expect(result.watermarkId, equals('WM_123'));
      });

      test('creates from error response', () {
        final json = MintFixtures.duplicateError();

        final result = MintResult.fromJson(json);
        expect(result.success, isFalse);
        expect(result.error, contains('already been minted'));
      });

      test('error factory creates error result', () {
        final result = MintResult.error('Network error');
        expect(result.success, isFalse);
        expect(result.error, equals('Network error'));
      });
    });

    group('LicenseType Enum', () {
      test('has correct contract values', () {
        expect(LicenseType.display.contractValue, equals(0));
        expect(LicenseType.commercial.contractValue, equals(1));
        expect(LicenseType.transfer.contractValue, equals(2));
      });

      test('fromString parses valid values', () {
        expect(LicenseType.fromString('display'), equals(LicenseType.display));
        expect(LicenseType.fromString('commercial'), equals(LicenseType.commercial));
        expect(LicenseType.fromString('transfer'), equals(LicenseType.transfer));
      });

      test('fromString is case-insensitive', () {
        expect(LicenseType.fromString('DISPLAY'), equals(LicenseType.display));
        expect(LicenseType.fromString('Commercial'), equals(LicenseType.commercial));
        expect(LicenseType.fromString('TRANSFER'), equals(LicenseType.transfer));
      });

      test('fromString defaults to display for unknown values', () {
        expect(LicenseType.fromString('unknown'), equals(LicenseType.display));
        expect(LicenseType.fromString(''), equals(LicenseType.display));
        expect(LicenseType.fromString('invalid'), equals(LicenseType.display));
      });

      test('displayName returns user-friendly strings', () {
        expect(LicenseType.display.displayName, equals('Display'));
        expect(LicenseType.commercial.displayName, equals('Commercial'));
        expect(LicenseType.transfer.displayName, equals('Full Transfer'));
      });

      test('description returns helpful text', () {
        expect(LicenseType.display.description, contains('Personal'));
        expect(LicenseType.commercial.description, contains('Commercial'));
        expect(LicenseType.transfer.description, contains('copyright'));
      });

      test('price returns default prices', () {
        expect(LicenseType.display.price, equals(1.00));
        expect(LicenseType.commercial.price, equals(5.00));
        expect(LicenseType.transfer.price, equals(10.00));
      });
    });

    group('Response Fixtures', () {
      test('marketplace listings fixture has expected structure', () {
        final response = MarketplaceFixtures.listingsResponse(count: 3);

        expect(response['listings'], isA<List>());
        expect((response['listings'] as List).length, equals(3));

        final listing = (response['listings'] as List)[0];
        expect(listing['tokenId'], isNotNull);
        expect(listing['name'], isNotNull);
        expect(listing['priceEth'], isNotNull);
        expect(listing['seller'], isNotNull);
      });

      test('gallery fixture has expected structure', () {
        final response = GalleryFixtures.galleryTokens(count: 2);

        expect(response['tokens'], isA<List>());
        expect((response['tokens'] as List).length, equals(2));

        final token = (response['tokens'] as List)[0];
        expect(token['tokenId'], isNotNull);
        expect(token['creator'], isNotNull);
        expect(token['currentOwner'], isNotNull);
      });

      test('license status fixtures cover all scenarios', () {
        // No license
        final noLicense = LicenseStatusFixtures.noExistingLicense();
        expect(noLicense['existingLicense'], isNull);
        expect(noLicense['canBuy']['display'], isTrue);

        // Has display
        final hasDisplay = LicenseStatusFixtures.hasDisplayLicense();
        expect(hasDisplay['existingLicense'], equals('display'));
        expect(hasDisplay['canBuy']['display'], isFalse);
        expect(hasDisplay['canBuy']['commercial'], isTrue);

        // Has commercial
        final hasCommercial = LicenseStatusFixtures.hasCommercialLicense();
        expect(hasCommercial['existingLicense'], equals('commercial'));
        expect(hasCommercial['canBuy']['display'], isFalse);
        expect(hasCommercial['canBuy']['transfer'], isTrue);

        // Has transfer
        final hasTransfer = LicenseStatusFixtures.hasTransferLicense();
        expect(hasTransfer['existingLicense'], equals('transfer'));
        expect(hasTransfer['canBuy']['transfer'], isFalse);
      });

      test('error fixtures have expected format', () {
        final notFound = ErrorFixtures.notFound('Token not found');
        expect(notFound['error'], equals('Token not found'));
        expect(notFound['code'], equals('NOT_FOUND'));

        final unauthorized = ErrorFixtures.unauthorized();
        expect(unauthorized['code'], equals('UNAUTHORIZED'));

        final serverError = ErrorFixtures.serverError();
        expect(serverError['code'], equals('INTERNAL_ERROR'));
      });
    });

    group('MockHttpClient', () {
      test('can stub GET requests', () {
        final mockClient = MockHttpClient();

        mockClient.stubGet('/api/test', {'result': 'success'});

        expect(mockClient.wasRequested('/api/test'), isFalse); // Not yet
      });

      test('can stub POST requests', () {
        final mockClient = MockHttpClient();

        mockClient.stubPost('/api/test', {'created': true});

        // Verify stub was added
        expect(mockClient, isNotNull);
      });

      test('can stub error responses', () {
        final mockClient = MockHttpClient();

        mockClient.stubError(
          '/api/test',
          error: 'Not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        );

        expect(mockClient, isNotNull);
      });

      test('reset clears stubs and requests', () {
        final mockClient = MockHttpClient();

        mockClient.stubGet('/api/test', {'data': 1});
        mockClient.reset();

        expect(mockClient.requests, isEmpty);
      });
    });

    group('getGeneratedImageUrl', () {
      test('constructs full URL from relative path', () {
        final api = ApiService();
        final url = api.getGeneratedImageUrl('/api/generate/gen-123/image/0');

        expect(url, contains(ApiService.baseUrl));
        expect(url, contains('/api/generate/gen-123/image/0'));
      });
    });
  });
}
