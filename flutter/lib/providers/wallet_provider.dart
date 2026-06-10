import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/test_account.dart';
import '../services/wallet_service.dart';

// Re-export for consumers that imported TestAccount from here
export '../models/test_account.dart';

/// Wallet connection states
enum WalletState {
  disconnected,
  connecting,
  connected,
  error,
}

/// EIP-712 typed data for signing
class TypedData {
  final Map<String, dynamic> domain;
  final String primaryType;
  final Map<String, List<Map<String, String>>> types;
  final Map<String, dynamic> message;

  TypedData({
    required this.domain,
    required this.primaryType,
    required this.types,
    required this.message,
  });
}

/// Manages wallet connection, authentication, and signing.
///
/// Fee simulation has been extracted to [FeeSimulationProvider].
class WalletProvider extends ChangeNotifier {
  WalletState _state = WalletState.disconnected;
  String? _address;
  String? _error;
  String? _authToken;
  int _chainId = kDebugMode ? 31337 : 137; // Hardhat local or Polygon mainnet
  TestAccount? _testAccount;

  // Wallet service for signing and transactions.
  // Injectable for testing — defaults to real WalletService in production.
  final WalletService _walletService;

  // Cached list of available accounts from wallet service
  List<TestAccount> _availableAccounts = [];

  WalletState get state => _state;
  String? get address => _address;
  String? get error => _error;
  String? get authToken => _authToken;
  int get chainId => _chainId;
  TestAccount? get testAccount => _testAccount;

  // Wallet service access
  WalletService get walletService => _walletService;

  // Available accounts from wallet service
  List<TestAccount> get availableAccounts => _availableAccounts;

  bool get isConnected => _state == WalletState.connected && _address != null;
  bool get isConnecting => _state == WalletState.connecting;

  /// Check if we're in local dev mode with test accounts
  bool get isLocalDevMode => kDebugMode;

  String get shortAddress {
    if (_address == null) return '';
    return '${_address!.substring(0, 6)}...${_address!.substring(_address!.length - 4)}';
  }

  WalletProvider({WalletService? walletService})
      : _walletService = walletService ?? WalletService() {
    // Use hardcoded accounts immediately for fast startup
    _availableAccounts = _defaultAccounts;
    _loadSavedSession();
    // Refresh from wallet service in background (non-blocking)
    _loadAvailableAccounts();
  }

  static const _defaultAccounts = [
    TestAccount(
      'Account #2',
      'Alice',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    ),
    TestAccount(
      'Account #3',
      'Bob',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    ),
    TestAccount(
      'Account #4',
      'Sam',
      '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    ),
    TestAccount(
      'Account #5',
      'Joe',
      '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    ),
    TestAccount(
      'Account #6',
      'Mary',
      '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    ),
  ];

  /// Load available accounts from wallet service (background refresh)
  Future<void> _loadAvailableAccounts() async {
    try {
      final accounts = await _walletService.getAccounts();
      _availableAccounts =
          accounts.map((a) => TestAccount.fromWalletAccount(a)).toList();
      notifyListeners();
    } catch (e) {
      debugPrint('Failed to load accounts from wallet service: $e');
      // Keep using default accounts
    }
  }

  Future<void> _loadSavedSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedAddress = prefs.getString('wallet_address');
      final savedToken = prefs.getString('auth_token');
      final savedSessionId = prefs.getString('wallet_session_id');

      if (savedAddress != null &&
          savedToken != null &&
          savedSessionId != null) {
        _address = savedAddress;
        _authToken = savedToken;
        _walletService.setSessionId(savedSessionId);
        _state = WalletState.connected;

        // Try to get account info from wallet service
        try {
          final account = await _walletService.getCurrentAccount();
          _testAccount = TestAccount.fromWalletAccount(account);
        } catch (_) {
          // Session may have expired, clear it
          await _clearSession();
          return;
        }

        notifyListeners();
      }
    } catch (e) {
      debugPrint('Failed to load saved session: $e');
    }
  }

  Future<void> _saveSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_address != null &&
          _authToken != null &&
          _walletService.sessionId != null) {
        await prefs.setString('wallet_address', _address!);
        await prefs.setString('auth_token', _authToken!);
        await prefs.setString('wallet_session_id', _walletService.sessionId!);
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
      await prefs.remove('wallet_session_id');
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

    // For demo, connect using wallet service with default account
    await Future.delayed(const Duration(seconds: 1));

    // Get first available account
    if (_availableAccounts.isEmpty) {
      await _loadAvailableAccounts();
    }

    if (_availableAccounts.isEmpty) {
      throw Exception('No accounts available');
    }

    // Select first account via wallet service
    await _walletService.selectAccount(_availableAccounts[0].address);
    _address = _availableAccounts[0].address;
    _testAccount = _availableAccounts[0];

    // Get SIWE auth token from wallet service
    _authToken = await _walletService.getAuthToken();
  }

  Future<void> _connectMobile() async {
    // WalletConnect implementation would go here
    // For demo, use wallet service
    await _connectWeb();
  }

  /// Sign a message with the connected wallet
  Future<String> signMessage(String message) async {
    if (!isConnected) {
      throw Exception('Wallet not connected');
    }

    return await _walletService.signMessage(message);
  }

  /// Sign EIP-712 typed data
  /// Returns the signature as bytes
  Future<Uint8List> signTypedData(Map<String, dynamic> typedData) async {
    if (!isConnected) {
      throw Exception('Wallet not connected');
    }

    return await _walletService.signTypedDataAsBytes(typedData);
  }

  /// Send a transaction through the wallet service
  Future<TransactionResult> sendTransaction({
    required String to,
    required String data,
    String value = '0',
  }) async {
    if (!isConnected) {
      throw Exception('Wallet not connected');
    }

    return await _walletService.sendTransaction(
      to: to,
      data: data,
      value: value,
    );
  }

  /// Check if wallet can sign transactions directly
  bool get canSignTransactions => _walletService.hasSession;

  /// Disconnect wallet
  Future<void> disconnect() async {
    await _walletService.disconnect();
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

      // Select account via wallet service
      await _walletService.selectAccount(account.address);
      _address = account.address;
      _testAccount = account;

      // Get SIWE auth token from wallet service
      _authToken = await _walletService.getAuthToken();

      await _saveSession();
      _state = WalletState.connected;
    } catch (e) {
      _state = WalletState.error;
      _error = e.toString();
    }
    notifyListeners();
  }

  /// Get account by nickname
  TestAccount? getAccountByNickname(String nickname) {
    final lower = nickname.toLowerCase();
    try {
      return _availableAccounts.firstWhere(
        (a) => a.nickname.toLowerCase() == lower,
      );
    } catch (_) {
      return null;
    }
  }

  /// Get all test accounts including platform
  List<TestAccount> get allAccounts => [platformWallet, ..._availableAccounts];
}
