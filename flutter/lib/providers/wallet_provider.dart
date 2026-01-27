import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:crypto/crypto.dart';

/// Wallet connection states
enum WalletState {
  disconnected,
  connecting,
  connected,
  error,
}

/// Hardhat test accounts (for local development)
class TestAccount {
  final String name;
  final String address;
  final String privateKey;

  const TestAccount(this.name, this.address, this.privateKey);
}

const hardhatAccounts = [
  TestAccount(
      'Account #2 (User A)',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'),
  TestAccount(
      'Account #3 (User B)',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'),
  TestAccount(
      'Account #4 (User C)',
      '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'),
  TestAccount(
      'Account #5 (User D)',
      '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'),
];

/// Manages wallet connection and signing
class WalletProvider extends ChangeNotifier {
  WalletState _state = WalletState.disconnected;
  String? _address;
  String? _error;
  String? _authToken;
  int _chainId = kDebugMode ? 31337 : 137; // Hardhat local or Polygon mainnet
  TestAccount? _testAccount;

  WalletState get state => _state;
  String? get address => _address;
  String? get error => _error;
  String? get authToken => _authToken;
  int get chainId => _chainId;
  TestAccount? get testAccount => _testAccount;

  bool get isConnected => _state == WalletState.connected && _address != null;
  bool get isConnecting => _state == WalletState.connecting;

  /// Check if we're in local dev mode with test accounts
  bool get isLocalDevMode => kDebugMode;

  String get shortAddress {
    if (_address == null) return '';
    return '${_address!.substring(0, 6)}...${_address!.substring(_address!.length - 4)}';
  }

  WalletProvider() {
    _loadSavedSession();
  }

  Future<void> _loadSavedSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedAddress = prefs.getString('wallet_address');
      final savedToken = prefs.getString('auth_token');

      if (savedAddress != null && savedToken != null) {
        _address = savedAddress;
        _authToken = savedToken;
        _state = WalletState.connected;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Failed to load saved session: $e');
    }
  }

  Future<void> _saveSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_address != null && _authToken != null) {
        await prefs.setString('wallet_address', _address!);
        await prefs.setString('auth_token', _authToken!);
      }
    } catch (e) {
      debugPrint('Failed to save session: $e');
    }
  }

  Future<void> _clearSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('wallet_address');
      await prefs.remove('auth_token');
    } catch (e) {
      debugPrint('Failed to clear session: $e');
    }
  }

  /// Connect wallet (simplified for web - uses mock for demo)
  /// In production, use WalletConnect or injected provider
  Future<void> connect() async {
    _state = WalletState.connecting;
    _error = null;
    notifyListeners();

    try {
      // For web, check if MetaMask is available
      if (kIsWeb) {
        await _connectWeb();
      } else {
        // For mobile, use WalletConnect
        await _connectMobile();
      }

      await _saveSession();
      _state = WalletState.connected;
    } catch (e) {
      _state = WalletState.error;
      _error = e.toString();
    }
    notifyListeners();
  }

  Future<void> _connectWeb() async {
    // In a real implementation, you would:
    // 1. Check for window.ethereum
    // 2. Request accounts
    // 3. Get SIWE message signed
    // 4. Create auth token

    // For demo, simulate connection
    await Future.delayed(const Duration(seconds: 1));

    // Simulated address with correct EIP-55 checksum (in production, get from MetaMask)
    _address = '0x742D35cC6634C0532925a3b844Bc9e7595f2Bd7e';

    // Create SIWE auth token
    _authToken = await _createAuthToken(_address!);
  }

  Future<void> _connectMobile() async {
    // WalletConnect implementation would go here
    await Future.delayed(const Duration(seconds: 1));
    _address = '0x742D35cC6634C0532925a3b844Bc9e7595f2Bd7e';
    _authToken = await _createAuthToken(_address!);
  }

  Future<String> _createAuthToken(String address) async {
    final now = DateTime.now().toUtc();
    final expiry = now.add(const Duration(days: 7));

    // Format datetime as ISO 8601 with Z suffix (required by SIWE)
    String formatDateTime(DateTime dt) {
      return '${dt.toIso8601String().split('.').first}Z';
    }

    // Use localhost in debug mode, production URL otherwise
    final domain = kDebugMode ? 'localhost' : 'nftmarket.com';
    final uri =
        kDebugMode ? 'http://localhost:3000' : 'https://api.nftmarket.com';

    // SIWE message format (EIP-4361)
    // Each field must be on its own line with no extra whitespace
    final message = '$domain wants you to sign in with your Ethereum account:\n'
        '$address\n'
        '\n'
        'Sign in to NFTmarket\n'
        '\n'
        'URI: $uri\n'
        'Version: 1\n'
        'Chain ID: $_chainId\n'
        'Nonce: ${_generateNonce()}\n'
        'Issued At: ${formatDateTime(now)}\n'
        'Expiration Time: ${formatDateTime(expiry)}';

    // In production, this signature would come from the wallet
    final signature = _mockSign(message, address);

    // Create token
    final tokenData = {
      'message': message,
      'signature': signature,
    };

    return base64Encode(utf8.encode(jsonEncode(tokenData)));
  }

  String _generateNonce() {
    // SIWE nonce must be at least 8 alphanumeric characters only (no special chars)
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final random = DateTime.now().microsecondsSinceEpoch;
    final buffer = StringBuffer();
    for (var i = 0; i < 16; i++) {
      buffer.write(chars[(random + i * 7) % chars.length]);
    }
    return buffer.toString();
  }

  String _mockSign(String message, String address) {
    // Mock signature for demo
    // In production, wallet.signMessage(message) would be called
    final hash = sha256.convert(utf8.encode(message + address));
    return '0x${hash.toString()}';
  }

  /// Sign a message with the connected wallet
  Future<String> signMessage(String message) async {
    if (!isConnected) {
      throw Exception('Wallet not connected');
    }

    // In production, call wallet.signMessage(message)
    // For demo, return mock signature
    final hash = sha256.convert(utf8.encode(message + _address!));
    return '0x${hash.toString()}';
  }

  /// Disconnect wallet
  Future<void> disconnect() async {
    _state = WalletState.disconnected;
    _address = null;
    _authToken = null;
    _error = null;
    _testAccount = null;
    await _clearSession();
    notifyListeners();
  }

  /// Connect with a specific test account (for local development)
  Future<void> connectTestAccount(TestAccount account) async {
    _state = WalletState.connecting;
    _error = null;
    notifyListeners();

    try {
      await Future.delayed(const Duration(milliseconds: 300));

      _address = account.address;
      _testAccount = account;
      _authToken = await _createAuthToken(account.address);

      await _saveSession();
      _state = WalletState.connected;
    } catch (e) {
      _state = WalletState.error;
      _error = e.toString();
    }
    notifyListeners();
  }
}
