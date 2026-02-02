import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/wallet_service.dart';

/// Wallet connection states
enum WalletState {
  disconnected,
  connecting,
  connected,
  error,
}

/// Simplified test account (no private key - that's in wallet service now)
class TestAccount {
  final String name;
  final String nickname;
  final String address;
  final bool isPlatform;

  const TestAccount(
    this.name,
    this.nickname,
    this.address, {
    this.isPlatform = false,
  });

  String get displayName => nickname.isNotEmpty ? nickname : name;

  factory TestAccount.fromWalletAccount(WalletAccount account) {
    return TestAccount(
      account.name,
      account.nickname,
      account.address,
    );
  }
}

/// Platform wallet for collecting fees
const platformWallet = TestAccount(
  'Account #1',
  'Platform',
  '0x70997970C51812dc3A010C7d01b50e44D9c4F5Ee',
  isPlatform: true,
);

/// Fee types for simulation
enum FeeType {
  subscription, // Monthly subscription fee
  mint, // Per-mint fee
  aiGeneration, // Per AI generation fee
}

/// Simulated fee transaction
class FeeTransaction {
  final String id;
  final FeeType type;
  final String fromAddress;
  final BigInt amount;
  final DateTime timestamp;
  final String description;

  FeeTransaction({
    required this.id,
    required this.type,
    required this.fromAddress,
    required this.amount,
    required this.timestamp,
    required this.description,
  });
}

/// Fee configuration (in wei)
class FeeConfig {
  // Monthly subscription: 0.01 ETH
  static final BigInt subscriptionFee = BigInt.from(10000000000000000);

  // Per mint: 0.001 ETH
  static final BigInt mintFee = BigInt.from(1000000000000000);

  // Per AI generation: 0.0005 ETH
  static final BigInt aiGenerationFee = BigInt.from(500000000000000);

  // Format wei to ETH string
  static String formatEth(BigInt wei) {
    final eth = wei / BigInt.from(10).pow(18);
    final remainder = wei % BigInt.from(10).pow(18);
    final decimal = (remainder / BigInt.from(10).pow(14)).toInt();
    return '${eth.toInt()}.${decimal.toString().padLeft(4, '0')} ETH';
  }
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

/// Manages wallet connection and signing
class WalletProvider extends ChangeNotifier {
  WalletState _state = WalletState.disconnected;
  String? _address;
  String? _error;
  String? _authToken;
  int _chainId = kDebugMode ? 31337 : 137; // Hardhat local or Polygon mainnet
  TestAccount? _testAccount;

  // Wallet service for signing and transactions
  final WalletService _walletService = WalletService();

  // Cached list of available accounts from wallet service
  List<TestAccount> _availableAccounts = [];

  // Fee simulation state
  final Map<String, BigInt> _simulatedBalances = {};
  final List<FeeTransaction> _feeTransactions = [];
  final Map<String, DateTime> _subscriptionExpiry = {};

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

  // Fee simulation getters
  List<FeeTransaction> get feeTransactions => List.unmodifiable(_feeTransactions);
  BigInt get platformBalance => _simulatedBalances[platformWallet.address] ?? BigInt.zero;

  bool get isConnected => _state == WalletState.connected && _address != null;
  bool get isConnecting => _state == WalletState.connecting;

  /// Check if we're in local dev mode with test accounts
  bool get isLocalDevMode => kDebugMode;

  String get shortAddress {
    if (_address == null) return '';
    return '${_address!.substring(0, 6)}...${_address!.substring(_address!.length - 4)}';
  }

  WalletProvider() {
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
      _availableAccounts = accounts
          .map((a) => TestAccount.fromWalletAccount(a))
          .toList();
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

      if (savedAddress != null && savedToken != null && savedSessionId != null) {
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
      if (_address != null && _authToken != null && _walletService.sessionId != null) {
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

  // ============================================================
  // Fee Simulation Methods (for local development testing)
  // ============================================================

  /// Initialize simulated balances for all test accounts
  void initializeSimulatedBalances() {
    // Give each user 10 ETH starting balance
    final startingBalance = BigInt.from(10) * BigInt.from(10).pow(18);
    for (final account in _availableAccounts) {
      _simulatedBalances[account.address] = startingBalance;
    }
    // Platform wallet starts at 0
    _simulatedBalances[platformWallet.address] = BigInt.zero;
    notifyListeners();
  }

  /// Get simulated balance for an address
  BigInt getSimulatedBalance(String address) {
    return _simulatedBalances[address] ?? BigInt.zero;
  }

  /// Get current user's simulated balance
  BigInt get currentBalance {
    if (_address == null) return BigInt.zero;
    return getSimulatedBalance(_address!);
  }

  /// Check if current user has an active subscription
  bool get hasActiveSubscription {
    if (_address == null) return false;
    final expiry = _subscriptionExpiry[_address!];
    if (expiry == null) return false;
    return expiry.isAfter(DateTime.now());
  }

  /// Get subscription expiry date for current user
  DateTime? get subscriptionExpiry {
    if (_address == null) return null;
    return _subscriptionExpiry[_address!];
  }

  /// Pay monthly subscription fee
  Future<bool> paySubscriptionFee() async {
    if (!isConnected || _address == null) return false;

    final balance = getSimulatedBalance(_address!);
    if (balance < FeeConfig.subscriptionFee) {
      _error = 'Insufficient balance for subscription';
      notifyListeners();
      return false;
    }

    // Deduct from user, add to platform
    _simulatedBalances[_address!] = balance - FeeConfig.subscriptionFee;
    _simulatedBalances[platformWallet.address] =
        (_simulatedBalances[platformWallet.address] ?? BigInt.zero) +
            FeeConfig.subscriptionFee;

    // Set subscription expiry to 30 days from now
    _subscriptionExpiry[_address!] = DateTime.now().add(const Duration(days: 30));

    // Record transaction
    _feeTransactions.add(FeeTransaction(
      id: 'sub_${DateTime.now().millisecondsSinceEpoch}',
      type: FeeType.subscription,
      fromAddress: _address!,
      amount: FeeConfig.subscriptionFee,
      timestamp: DateTime.now(),
      description: 'Monthly subscription fee',
    ));

    notifyListeners();
    return true;
  }

  /// Pay mint fee
  Future<bool> payMintFee() async {
    if (!isConnected || _address == null) return false;

    final balance = getSimulatedBalance(_address!);
    if (balance < FeeConfig.mintFee) {
      _error = 'Insufficient balance for minting';
      notifyListeners();
      return false;
    }

    // Deduct from user, add to platform
    _simulatedBalances[_address!] = balance - FeeConfig.mintFee;
    _simulatedBalances[platformWallet.address] =
        (_simulatedBalances[platformWallet.address] ?? BigInt.zero) +
            FeeConfig.mintFee;

    // Record transaction
    _feeTransactions.add(FeeTransaction(
      id: 'mint_${DateTime.now().millisecondsSinceEpoch}',
      type: FeeType.mint,
      fromAddress: _address!,
      amount: FeeConfig.mintFee,
      timestamp: DateTime.now(),
      description: 'NFT minting fee',
    ));

    notifyListeners();
    return true;
  }

  /// Pay AI generation fee
  Future<bool> payAiGenerationFee() async {
    if (!isConnected || _address == null) return false;

    final balance = getSimulatedBalance(_address!);
    if (balance < FeeConfig.aiGenerationFee) {
      _error = 'Insufficient balance for AI generation';
      notifyListeners();
      return false;
    }

    // Deduct from user, add to platform
    _simulatedBalances[_address!] = balance - FeeConfig.aiGenerationFee;
    _simulatedBalances[platformWallet.address] =
        (_simulatedBalances[platformWallet.address] ?? BigInt.zero) +
            FeeConfig.aiGenerationFee;

    // Record transaction
    _feeTransactions.add(FeeTransaction(
      id: 'ai_${DateTime.now().millisecondsSinceEpoch}',
      type: FeeType.aiGeneration,
      fromAddress: _address!,
      amount: FeeConfig.aiGenerationFee,
      timestamp: DateTime.now(),
      description: 'AI image generation fee',
    ));

    notifyListeners();
    return true;
  }

  /// Get fee transactions for current user
  List<FeeTransaction> get userFeeTransactions {
    if (_address == null) return [];
    return _feeTransactions
        .where((t) => t.fromAddress == _address)
        .toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
  }

  /// Get total fees paid by current user
  BigInt get totalFeesPaid {
    if (_address == null) return BigInt.zero;
    return _feeTransactions
        .where((t) => t.fromAddress == _address)
        .fold(BigInt.zero, (sum, t) => sum + t.amount);
  }

  /// Get total platform revenue
  BigInt get totalPlatformRevenue {
    return _feeTransactions.fold(BigInt.zero, (sum, t) => sum + t.amount);
  }

  /// Reset fee simulation state
  void resetFeeSimulation() {
    _simulatedBalances.clear();
    _feeTransactions.clear();
    _subscriptionExpiry.clear();
    initializeSimulatedBalances();
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
