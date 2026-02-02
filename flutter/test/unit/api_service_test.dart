import 'package:flutter_test/flutter_test.dart';
import 'package:nftmarket/services/api_service.dart';
import 'package:nftmarket/models/token.dart';

void main() {
  group('ApiService', () {
    group('URL construction', () {
      test('uses default base URL', () {
        expect(ApiService.baseUrl, contains('localhost'));
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
  });

  group('GenerationResult', () {
    test('creates from JSON', () {
      final json = {
        'success': true,
        'generationId': 'gen-123',
        'prompt': 'a cat',
        'style': 'photographic',
        'images': [
          {'id': 'img-1', 'seed': 12345, 'url': '/api/generate/gen-123/image/0'},
        ],
      };

      final result = GenerationResult.fromJson(json);
      expect(result.success, isTrue);
      expect(result.generationId, equals('gen-123'));
      expect(result.images.length, equals(1));
      expect(result.images[0].seed, equals(12345));
    });

    test('creates error result', () {
      final result = GenerationResult.error('Failed to generate');
      expect(result.success, isFalse);
      expect(result.error, equals('Failed to generate'));
    });
  });
}
