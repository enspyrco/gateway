import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:http/http.dart' as http;

import '../models/token.dart';

class ApiException implements Exception {
  final String message;
  final String? code;
  final int? statusCode;

  ApiException(this.message, {this.code, this.statusCode});

  @override
  String toString() => message;
}

class ApiService {
  // Baked in at compile time; omitting --dart-define=API_URL in a release
  // build must fail loudly rather than silently hit the developer's machine.
  static const String _configuredUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Resolved base URL.  Debug builds may use localhost; release builds must
  /// have API_URL injected at compile time.
  static final String baseUrl = () {
    if (!kDebugMode && _configuredUrl.contains('localhost')) {
      throw StateError(
        'API_URL is not configured for a release build. '
        'Pass --dart-define=API_URL=https://your-api-host when building. '
        'Refusing to use localhost in production.',
      );
    }
    return _configuredUrl;
  }();

  final String? authToken;

  /// Injectable HTTP client — real [http.Client] in production, fake in tests.
  /// Keeping this field internal avoids leaking test infrastructure to callers.
  final http.Client _httpClient;

  ApiService({this.authToken, http.Client? httpClient})
      : _httpClient = httpClient ?? http.Client();

  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (authToken != null) {
      headers['Authorization'] = 'Bearer $authToken';
    }
    return headers;
  }

  Future<Map<String, dynamic>> _handleResponse(http.Response response) async {
    final body = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    throw ApiException(
      body['error'] as String? ?? 'Unknown error',
      code: body['code'] as String?,
      statusCode: response.statusCode,
    );
  }

  // ============ Minting ============

  /// Get license text for signing (used when listing for sale)
  Future<String> getLicenseText(LicenseType licenseType) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/mint/license/${licenseType.name}'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return data['text'] as String;
  }

  /// Mint a new NFT
  Future<MintResult> mint({
    required Uint8List imageBytes,
    required String fileName,
    required String name,
    required String description,
  }) async {
    final uri = Uri.parse('$baseUrl/api/mint');
    final request = http.MultipartRequest('POST', uri);

    // Add auth header
    if (authToken != null) {
      request.headers['Authorization'] = 'Bearer $authToken';
    }

    // Add file
    request.files.add(http.MultipartFile.fromBytes(
      'image',
      imageBytes,
      filename: fileName,
    ));

    // Add fields
    request.fields['name'] = name;
    request.fields['description'] = description;

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    try {
      final data = await _handleResponse(response);
      return MintResult.fromJson(data);
    } catch (e) {
      return MintResult.error(e.toString());
    }
  }

  // ============ Verification ============

  /// Get token verification info (public)
  Future<Token> getTokenInfo(int tokenId) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/verify/$tokenId'),
    );
    final data = await _handleResponse(response);
    return Token.fromJson(data);
  }

  /// Check if image hash is registered (public)
  Future<bool> isImageRegistered(String imageHash) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/verify/check/$imageHash'),
    );
    final data = await _handleResponse(response);
    return data['registered'] as bool;
  }

  /// Get platform stats (public)
  Future<Map<String, dynamic>> getStats() async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/verify/stats'),
    );
    return _handleResponse(response);
  }

  // ============ Detection ============

  /// Run watermark detection (non-blind, requires tokenId)
  Future<Map<String, dynamic>> detect({
    required int tokenId,
    required Uint8List capturedImageBytes,
    required String fileName,
  }) async {
    final uri = Uri.parse('$baseUrl/api/detect');
    final request = http.MultipartRequest('POST', uri);

    if (authToken != null) {
      request.headers['Authorization'] = 'Bearer $authToken';
    }

    request.files.add(http.MultipartFile.fromBytes(
      'capturedImage',
      capturedImageBytes,
      filename: fileName,
    ));

    request.fields['tokenId'] = tokenId.toString();

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    return _handleResponse(response);
  }

  /// Run blind watermark detection (extracts watermark without reference)
  /// Returns detected wallet:tokenId from the image itself
  Future<BlindDetectionResult> detectBlind({
    required Uint8List imageBytes,
    required String fileName,
  }) async {
    final uri = Uri.parse('$baseUrl/api/detect/blind');
    final request = http.MultipartRequest('POST', uri);

    if (authToken != null) {
      request.headers['Authorization'] = 'Bearer $authToken';
    }

    request.files.add(http.MultipartFile.fromBytes(
      'image',
      imageBytes,
      filename: fileName,
    ));

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    final data = await _handleResponse(response);
    return BlindDetectionResult.fromJson(data);
  }

  // ============ Public Verification ============

  /// Verify an image against a token's watermark (public)
  Future<Map<String, dynamic>> verifyImage(
      int tokenId, Uint8List imageBytes) async {
    final uri = Uri.parse('$baseUrl/api/verify/$tokenId/check');
    final request = http.MultipartRequest('POST', uri);

    request.files.add(http.MultipartFile.fromBytes(
      'image',
      imageBytes,
      filename: 'verify.png',
    ));

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    return _handleResponse(response);
  }

  // ============ Gallery ============

  /// Get list of galleries (wallets with NFTs)
  Future<List<Map<String, dynamic>>> getGalleryList() async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/gallery'),
    );
    final data = await _handleResponse(response);
    return List<Map<String, dynamic>>.from(data['galleries'] ?? []);
  }

  /// Get all tokens owned by an address (public)
  Future<List<Map<String, dynamic>>> getGallery(String address) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/gallery/$address'),
    );
    final data = await _handleResponse(response);
    return List<Map<String, dynamic>>.from(data['tokens'] ?? []);
  }

  // ============ Marketplace ============
  //
  // Backend handles all marketplace logic. Client just signs and submits.
  // Flow: 1) Call prepare endpoint 2) Sign typed data 3) Submit to contract

  /// Get contract address from backend's EIP-712 domain
  /// This is the single source of truth for the contract address
  Future<String> getContractAddress() async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/marketplace/eip712/domain'),
    );
    final data = await _handleResponse(response);
    final domain = data['domain'] as Map<String, dynamic>;
    return domain['verifyingContract'] as String;
  }

  /// Get all active listings (public)
  Future<List<Map<String, dynamic>>> getListings() async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/marketplace'),
    );
    final data = await _handleResponse(response);
    return List<Map<String, dynamic>>.from(data['listings'] ?? []);
  }

  /// Get listing for a specific token
  Future<Map<String, dynamic>> getListing(int tokenId) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/marketplace/$tokenId'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  /// Get user's license status for a token (what they already own, what they can buy)
  /// Returns: { existingLicense, canBuy: { display, commercial, transfer } }
  Future<Map<String, dynamic>> getLicenseStatus(int tokenId) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/marketplace/$tokenId/license-status'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  /// Prepare a listing - backend handles all logic
  /// Returns typed data to sign and contract call params
  Future<Map<String, dynamic>> prepareListing({
    required int tokenId,
    required String priceEth,
    required String licenseType,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl/api/marketplace/list'),
      headers: _headers,
      body: jsonEncode({
        'tokenId': tokenId,
        'priceEth': priceEth,
        'licenseType': licenseType,
      }),
    );
    return _handleResponse(response);
  }

  /// Prepare a delisting - backend validates ownership
  /// Returns contract call params
  /// licenseType must be one of: 'display', 'commercial', 'transfer'
  Future<Map<String, dynamic>> prepareDelisting({
    required int tokenId,
    required String licenseType,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl/api/marketplace/delist'),
      headers: _headers,
      body: jsonEncode({
        'tokenId': tokenId,
        'licenseType': licenseType,
      }),
    );
    return _handleResponse(response);
  }

  /// Prepare a purchase - backend handles all logic
  /// Returns typed data to sign and contract call params
  /// licenseType must be one of: 'display', 'commercial', 'transfer'
  Future<Map<String, dynamic>> preparePurchase({
    required int tokenId,
    required String licenseType,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl/api/marketplace/buy'),
      headers: _headers,
      body: jsonEncode({
        'tokenId': tokenId,
        'licenseType': licenseType,
      }),
    );
    return _handleResponse(response);
  }

  // ============ ABI Encoding (Backend handles all encoding) ============

  /// Encode a list transaction after signing
  /// Returns pre-encoded txData ready to submit
  Future<Map<String, dynamic>> encodeListTransaction({
    required int tokenId,
    required String price,
    required int licenseType,
    required String licenseHash,
    required int expiry,
    required String signature,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl/api/marketplace/list/encode'),
      headers: _headers,
      body: jsonEncode({
        'tokenId': tokenId,
        'price': price,
        'licenseType': licenseType,
        'licenseHash': licenseHash,
        'expiry': expiry,
        'signature': signature,
      }),
    );
    return _handleResponse(response);
  }

  /// Encode a buy transaction after signing
  /// Returns pre-encoded txData and value (price in wei)
  Future<Map<String, dynamic>> encodeBuyTransaction({
    required int tokenId,
    required String licenseType,
    required String signature,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl/api/marketplace/buy/encode'),
      headers: _headers,
      body: jsonEncode({
        'tokenId': tokenId,
        'licenseType': licenseType,
        'signature': signature,
      }),
    );
    return _handleResponse(response);
  }

  /// Encode a delist transaction
  /// Returns pre-encoded txData ready to submit
  Future<Map<String, dynamic>> encodeDelistTransaction({
    required int tokenId,
    String? licenseType,
    bool all = false,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl/api/marketplace/delist/encode'),
      headers: _headers,
      body: jsonEncode({
        'tokenId': tokenId,
        if (all) 'all': true else 'licenseType': licenseType,
      }),
    );
    return _handleResponse(response);
  }

  // ============ AI Generation ============

  /// Get available style presets (public)
  Future<List<Map<String, dynamic>>> getGenerationStyles() async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl/api/generate/styles'),
    );
    final data = await _handleResponse(response);
    return List<Map<String, dynamic>>.from(data['styles'] ?? []);
  }

  /// Generate images from a prompt
  /// Note: AI generation can take 30-60 seconds
  Future<GenerationResult> generate({
    required String prompt,
    String style = 'photographic',
    int count = 4,
  }) async {
    try {
      final response = await _httpClient
          .post(
            Uri.parse('$baseUrl/api/generate'),
            headers: _headers,
            body: jsonEncode({
              'prompt': prompt,
              'style': style,
              'count': count,
            }),
          )
          .timeout(const Duration(minutes: 2));
      final data = await _handleResponse(response);
      return GenerationResult.fromJson(data);
    } catch (e) {
      return GenerationResult.error(e.toString());
    }
  }

  /// Get full URL for a generated image
  String getGeneratedImageUrl(String relativePath) {
    return '$baseUrl$relativePath';
  }
}

class GenerationResult {
  final bool success;
  final String? generationId;
  final String? prompt;
  final String? style;
  final List<GeneratedImage> images;
  final String? error;

  GenerationResult({
    required this.success,
    this.generationId,
    this.prompt,
    this.style,
    this.images = const [],
    this.error,
  });

  factory GenerationResult.fromJson(Map<String, dynamic> json) {
    return GenerationResult(
      success: json['success'] ?? false,
      generationId: json['generationId'],
      prompt: json['prompt'],
      style: json['style'],
      images: (json['images'] as List<dynamic>?)
              ?.map((img) => GeneratedImage.fromJson(img))
              .toList() ??
          [],
    );
  }

  factory GenerationResult.error(String message) {
    return GenerationResult(success: false, error: message);
  }
}

class GeneratedImage {
  final String id;
  final int seed;
  final String url;

  GeneratedImage({required this.id, required this.seed, required this.url});

  factory GeneratedImage.fromJson(Map<String, dynamic> json) {
    return GeneratedImage(
      id: json['id'] ?? '',
      seed: json['seed'] ?? 0,
      url: json['url'] ?? '',
    );
  }
}

/// Result from blind watermark detection
class BlindDetectionResult {
  final bool detected;
  final int? tokenId;
  final String? wallet;
  final double confidence;
  final String? message;
  final int sequencesDecoded;
  final DetectedToken? token;
  final String? error;

  BlindDetectionResult({
    required this.detected,
    this.tokenId,
    this.wallet,
    required this.confidence,
    this.message,
    this.sequencesDecoded = 0,
    this.token,
    this.error,
  });

  factory BlindDetectionResult.fromJson(Map<String, dynamic> json) {
    return BlindDetectionResult(
      detected: json['detected'] ?? false,
      tokenId: json['tokenId'] as int?,
      wallet: json['wallet'] as String?,
      confidence: (json['confidence'] ?? 0).toDouble(),
      message: json['message'] as String?,
      sequencesDecoded: json['sequencesDecoded'] ?? 0,
      token:
          json['token'] != null ? DetectedToken.fromJson(json['token']) : null,
      error: json['error'] as String?,
    );
  }
}

/// Token info returned with blind detection
class DetectedToken {
  final int tokenId;
  final String creator;
  final String currentOwner;
  final String copyrightOwner;
  final String licenseType;

  DetectedToken({
    required this.tokenId,
    required this.creator,
    required this.currentOwner,
    required this.copyrightOwner,
    required this.licenseType,
  });

  factory DetectedToken.fromJson(Map<String, dynamic> json) {
    return DetectedToken(
      tokenId: json['tokenId'] ?? 0,
      creator: json['creator'] ?? '',
      currentOwner: json['currentOwner'] ?? '',
      copyrightOwner: json['copyrightOwner'] ?? '',
      licenseType: json['licenseType'] ?? 'unknown',
    );
  }
}
