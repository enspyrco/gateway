import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// A mock HTTP client that intercepts requests and returns canned responses.
///
/// This allows tests to run without external services by matching URL patterns
/// and returning pre-configured responses.
///
/// Usage:
/// ```dart
/// final mockClient = MockHttpClient();
/// mockClient.stubGet('/api/marketplace', {'listings': []});
/// // Pass mockClient to ApiService or inject via DI
/// ```
class MockHttpClient {
  final List<_RequestStub> _stubs = [];
  final List<http.Request> _requests = [];

  /// All captured requests for verification
  List<http.Request> get requests => List.unmodifiable(_requests);

  /// Clear all stubs and captured requests
  void reset() {
    _stubs.clear();
    _requests.clear();
  }

  /// Stub a GET request
  void stubGet(
    String urlPattern,
    dynamic responseBody, {
    int statusCode = 200,
    Map<String, String>? headers,
  }) {
    _stubs.add(_RequestStub(
      method: 'GET',
      urlPattern: urlPattern,
      responseBody: responseBody,
      statusCode: statusCode,
      headers: headers ?? {'content-type': 'application/json'},
    ));
  }

  /// Stub a POST request
  void stubPost(
    String urlPattern,
    dynamic responseBody, {
    int statusCode = 200,
    Map<String, String>? headers,
  }) {
    _stubs.add(_RequestStub(
      method: 'POST',
      urlPattern: urlPattern,
      responseBody: responseBody,
      statusCode: statusCode,
      headers: headers ?? {'content-type': 'application/json'},
    ));
  }

  /// Stub any request method
  void stub(
    String method,
    String urlPattern,
    dynamic responseBody, {
    int statusCode = 200,
    Map<String, String>? headers,
  }) {
    _stubs.add(_RequestStub(
      method: method.toUpperCase(),
      urlPattern: urlPattern,
      responseBody: responseBody,
      statusCode: statusCode,
      headers: headers ?? {'content-type': 'application/json'},
    ));
  }

  /// Stub an error response
  void stubError(
    String urlPattern, {
    String method = 'GET',
    String error = 'Internal server error',
    String? code,
    int statusCode = 500,
  }) {
    final body = {
      'error': error,
      if (code != null) 'code': code,
    };
    _stubs.add(_RequestStub(
      method: method.toUpperCase(),
      urlPattern: urlPattern,
      responseBody: body,
      statusCode: statusCode,
      headers: {'content-type': 'application/json'},
    ));
  }

  /// Verify a request was made to a URL pattern
  bool wasRequested(String urlPattern, {String? method}) {
    return _requests.any((req) =>
        _matchesPattern(req.url.toString(), urlPattern) &&
        (method == null || req.method == method.toUpperCase()));
  }

  /// Get all requests matching a URL pattern
  List<http.Request> getRequestsMatching(String urlPattern, {String? method}) {
    return _requests
        .where((req) =>
            _matchesPattern(req.url.toString(), urlPattern) &&
            (method == null || req.method == method.toUpperCase()))
        .toList();
  }

  /// Get the last request made (useful for verifying request body)
  http.Request? get lastRequest => _requests.isNotEmpty ? _requests.last : null;

  /// Create a MockClient instance for use with http package
  MockClient createClient() {
    return MockClient((request) async {
      // Capture the request
      _requests.add(request);

      // Find matching stub
      final stub = _findMatchingStub(request);
      if (stub == null) {
        // Return 404 for unmatched requests
        return http.Response(
          jsonEncode(
              {'error': 'No stub found for ${request.method} ${request.url}'}),
          404,
          headers: {'content-type': 'application/json'},
        );
      }

      // Return stubbed response
      final body = stub.responseBody is String
          ? stub.responseBody as String
          : jsonEncode(stub.responseBody);
      return http.Response(
        body,
        stub.statusCode,
        headers: stub.headers,
      );
    });
  }

  _RequestStub? _findMatchingStub(http.BaseRequest request) {
    // Find the most recently added matching stub (allows overriding)
    for (int i = _stubs.length - 1; i >= 0; i--) {
      final stub = _stubs[i];
      if (stub.method == request.method &&
          _matchesPattern(request.url.toString(), stub.urlPattern)) {
        return stub;
      }
    }
    return null;
  }

  bool _matchesPattern(String url, String pattern) {
    // Support simple patterns:
    // - Exact match: '/api/marketplace'
    // - Contains: '*marketplace*'
    // - Ends with: '*/123'
    // - Regex: starts with '^'
    if (pattern.startsWith('^')) {
      return RegExp(pattern).hasMatch(url);
    }
    if (pattern.startsWith('*') && pattern.endsWith('*')) {
      return url.contains(pattern.substring(1, pattern.length - 1));
    }
    if (pattern.startsWith('*')) {
      return url.endsWith(pattern.substring(1));
    }
    if (pattern.endsWith('*')) {
      return url.contains(pattern.substring(0, pattern.length - 1));
    }
    return url.contains(pattern);
  }
}

class _RequestStub {
  final String method;
  final String urlPattern;
  final dynamic responseBody;
  final int statusCode;
  final Map<String, String> headers;

  _RequestStub({
    required this.method,
    required this.urlPattern,
    required this.responseBody,
    required this.statusCode,
    required this.headers,
  });
}

/// Extension to make it easy to inject mock client into ApiService
extension MockHttpClientExtension on MockHttpClient {
  /// Create an ApiService-compatible HTTP client
  http.Client get client => createClient();
}
