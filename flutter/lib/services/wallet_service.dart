import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Account information from the wallet service
class WalletAccount {
  final String address;
  final String name;
  final String nickname;

  WalletAccount({
    required this.address,
    required this.name,
    required this.nickname,
  });

  factory WalletAccount.fromJson(Map<String, dynamic> json) {
    return WalletAccount(
      address: json['address'] as String,
      name: json['name'] as String,
      nickname: json['nickname'] as String,
    );
  }

  String get displayName => nickname.isNotEmpty ? nickname : name;
}

/// Transaction result from the wallet service
class TransactionResult {
  final String hash;
  final int blockNumber;
  final String gasUsed;
  final String status;

  TransactionResult({
    required this.hash,
    required this.blockNumber,
    required this.gasUsed,
    required this.status,
  });

  factory TransactionResult.fromJson(Map<String, dynamic> json) {
    return TransactionResult(
      hash: json['hash'] as String,
      blockNumber: json['blockNumber'] as int,
      gasUsed: json['gasUsed'] as String,
      status: json['status'] as String,
    );
  }

  bool get isSuccess => status == 'success';
}

/// Service for communicating with the wallet microservice
class WalletService {
  // Baked at build time (Flutter web freezes String.fromEnvironment into the JS).
  // In production this is the Caddy edge route
  // (https://gateway.imagineering.cc/wallet → wallet-service:3001); dev defaults
  // to the local wallet service.  A bare localhost default shipped to prod means
  // every visitor's browser hits THEIR own machine — the connect-wallet failure
  // that prompted charge 4.4.
  static const String _configuredUrl = String.fromEnvironment(
    'WALLET_URL',
    defaultValue: 'http://localhost:3001',
  );

  /// Resolved base URL.  Debug builds may use localhost; release builds must
  /// have WALLET_URL injected at compile time.
  static final String _baseUrl = () {
    if (!kDebugMode && _configuredUrl.contains('localhost')) {
      throw StateError(
        'WALLET_URL is not configured for a release build. '
        'Pass --dart-define=WALLET_URL=https://your-wallet-host when building. '
        'Refusing to use localhost in production.',
      );
    }
    return _configuredUrl;
  }();

  String? _sessionId;

  /// Get current session ID
  String? get sessionId => _sessionId;

  /// Check if we have an active session
  bool get hasSession => _sessionId != null;

  /// Get list of available test accounts
  Future<List<WalletAccount>> getAccounts() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/api/accounts'),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get accounts: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to get accounts');
    }

    final accounts = (data['accounts'] as List)
        .map((a) => WalletAccount.fromJson(a as Map<String, dynamic>))
        .toList();

    return accounts;
  }

  /// Select an account and create a session
  /// Returns the session ID
  Future<String> selectAccount(String address) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/accounts/select'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'address': address}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to select account: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to select account');
    }

    _sessionId = data['sessionId'] as String;
    debugPrint('[WalletService] Session created: $_sessionId');
    return _sessionId!;
  }

  /// Get current account info
  Future<WalletAccount> getCurrentAccount() async {
    _ensureSession();

    final response = await http.get(
      Uri.parse('$_baseUrl/api/accounts/current'),
      headers: {'X-Session-Id': _sessionId!},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get current account: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to get current account');
    }

    return WalletAccount.fromJson(data['account'] as Map<String, dynamic>);
  }

  /// Disconnect (delete session)
  Future<void> disconnect() async {
    if (_sessionId == null) return;

    try {
      await http.post(
        Uri.parse('$_baseUrl/api/accounts/disconnect'),
        headers: {'X-Session-Id': _sessionId!},
      );
    } catch (e) {
      debugPrint('[WalletService] Error disconnecting: $e');
    } finally {
      _sessionId = null;
    }
  }

  /// Generate a SIWE auth token for the backend
  Future<String> getAuthToken() async {
    _ensureSession();

    final response = await http.post(
      Uri.parse('$_baseUrl/api/auth/token'),
      headers: {'X-Session-Id': _sessionId!},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get auth token: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to get auth token');
    }

    return data['token'] as String;
  }

  /// Sign an arbitrary message (personal_sign)
  Future<String> signMessage(String message) async {
    _ensureSession();

    final response = await http.post(
      Uri.parse('$_baseUrl/api/sign/message'),
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': _sessionId!,
      },
      body: jsonEncode({'message': message}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to sign message: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to sign message');
    }

    return data['signature'] as String;
  }

  /// Sign EIP-712 typed data
  /// Returns signature as hex string
  Future<String> signTypedData(Map<String, dynamic> typedData) async {
    _ensureSession();

    final response = await http.post(
      Uri.parse('$_baseUrl/api/sign/typed-data'),
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': _sessionId!,
      },
      body: jsonEncode(typedData),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to sign typed data: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to sign typed data');
    }

    return data['signature'] as String;
  }

  /// Sign EIP-712 typed data and return as bytes
  Future<Uint8List> signTypedDataAsBytes(Map<String, dynamic> typedData) async {
    final signature = await signTypedData(typedData);
    return _hexToBytes(signature);
  }

  /// Send a transaction through the wallet service
  Future<TransactionResult> sendTransaction({
    required String to,
    required String data,
    String value = '0',
  }) async {
    _ensureSession();

    final response = await http.post(
      Uri.parse('$_baseUrl/api/transaction/send'),
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': _sessionId!,
      },
      body: jsonEncode({
        'to': to,
        'data': data,
        'value': value,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to send transaction: ${response.body}');
    }

    final responseData = jsonDecode(response.body) as Map<String, dynamic>;
    if (responseData['success'] != true) {
      throw Exception(responseData['error'] ?? 'Failed to send transaction');
    }

    return TransactionResult.fromJson(responseData);
  }

  /// Get current account balance
  Future<BigInt> getBalance() async {
    _ensureSession();

    final response = await http.get(
      Uri.parse('$_baseUrl/api/transaction/balance'),
      headers: {'X-Session-Id': _sessionId!},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get balance: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to get balance');
    }

    return BigInt.parse(data['balance'] as String);
  }

  /// Set session ID (for restoring sessions)
  void setSessionId(String? sessionId) {
    _sessionId = sessionId;
  }

  void _ensureSession() {
    if (_sessionId == null) {
      throw Exception('No wallet session. Call selectAccount first.');
    }
  }

  /// Convert hex string to bytes
  Uint8List _hexToBytes(String hex) {
    hex = hex.replaceFirst('0x', '');
    final result = <int>[];
    for (var i = 0; i < hex.length; i += 2) {
      result.add(int.parse(hex.substring(i, i + 2), radix: 16));
    }
    return Uint8List.fromList(result);
  }
}
