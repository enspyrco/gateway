import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';
import 'package:nftmarket/services/wallet_service.dart';
import 'package:nftmarket/theme.dart';

/// A test wrapper that provides pre-configured providers and routing.
///
/// This simplifies writing widget tests by handling the common setup:
/// - WalletProvider with optional pre-connected state
/// - MintProvider with wallet dependency
/// - GoRouter for navigation testing
/// - Dark theme matching production app
///
/// Usage:
/// ```dart
/// await tester.pumpWidget(
///   TestApp(
///     connected: true,
///     connectedAddress: TestAddresses.alice,
///     child: MarketplacePage(),
///   ),
/// );
/// ```
class TestApp extends StatelessWidget {
  final Widget child;
  final bool connected;
  final String? connectedAddress;
  final WalletProvider? walletProvider;
  final MintProvider? mintProvider;
  final List<GoRoute>? additionalRoutes;
  final String initialRoute;

  const TestApp({
    super.key,
    required this.child,
    this.connected = false,
    this.connectedAddress,
    this.walletProvider,
    this.mintProvider,
    this.additionalRoutes,
    this.initialRoute = '/',
  });

  @override
  Widget build(BuildContext context) {
    final wallet = walletProvider ?? _createWalletProvider();
    final mint = mintProvider ?? MintProvider();

    // If a custom wallet provider wasn't given and we want connected state,
    // we need to set up the connected state manually since we can't use
    // async methods in build()
    if (walletProvider == null && connected && connectedAddress != null) {
      // Use the internal state setup via reflection-like approach
      // Since WalletProvider doesn't expose setters, we use TestWalletProvider
    }

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<WalletProvider>.value(value: wallet),
        ChangeNotifierProxyProvider<WalletProvider, MintProvider>(
          create: (_) => mint,
          update: (_, walletProv, mintProv) => mintProv!..updateWallet(walletProv),
        ),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: NFTmarketTheme.dark,
        home: child,
      ),
    );
  }

  WalletProvider _createWalletProvider() {
    return WalletProvider();
  }
}

/// A test-friendly WalletProvider that allows setting state directly.
///
/// This avoids async operations and SharedPreferences in tests.
class TestWalletProvider extends ChangeNotifier implements WalletProvider {
  WalletState _state = WalletState.disconnected;
  String? _address;
  String? _error;
  String? _authToken;
  int _chainId = 31337;
  TestAccount? _testAccount;
  List<TestAccount> _availableAccounts = const [];
  final Map<String, BigInt> _simulatedBalances = {};
  final List<FeeTransaction> _feeTransactions = [];
  final Map<String, DateTime> _subscriptionExpiry = {};

  TestWalletProvider({
    bool connected = false,
    String? address,
    String? authToken,
    TestAccount? testAccount,
    List<TestAccount>? availableAccounts,
  }) {
    if (connected && address != null) {
      _state = WalletState.connected;
      _address = address;
      _authToken = authToken ?? 'test-auth-token-${address.substring(0, 8)}';
      _testAccount = testAccount;
    }
    _availableAccounts = availableAccounts ?? _defaultAccounts;
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

  // State getters
  @override
  WalletState get state => _state;
  @override
  String? get address => _address;
  @override
  String? get error => _error;
  @override
  String? get authToken => _authToken;
  @override
  int get chainId => _chainId;
  @override
  TestAccount? get testAccount => _testAccount;
  @override
  List<TestAccount> get availableAccounts => _availableAccounts;
  @override
  bool get isConnected => _state == WalletState.connected && _address != null;
  @override
  bool get isConnecting => _state == WalletState.connecting;
  @override
  bool get isLocalDevMode => true;
  @override
  String get shortAddress {
    if (_address == null) return '';
    return '${_address!.substring(0, 6)}...${_address!.substring(_address!.length - 4)}';
  }

  // Test helpers for setting state directly
  void setConnected(String address, {String? authToken, TestAccount? account}) {
    _state = WalletState.connected;
    _address = address;
    _authToken = authToken ?? 'test-auth-token-${address.substring(0, 8)}';
    _testAccount = account;
    notifyListeners();
  }

  void setDisconnected() {
    _state = WalletState.disconnected;
    _address = null;
    _authToken = null;
    _testAccount = null;
    notifyListeners();
  }

  void setError(String error) {
    _state = WalletState.error;
    _error = error;
    notifyListeners();
  }

  void setConnecting() {
    _state = WalletState.connecting;
    notifyListeners();
  }

  // WalletProvider interface implementations (simplified for testing)
  @override
  Future<void> connect() async {
    _state = WalletState.connecting;
    notifyListeners();
    await Future.delayed(const Duration(milliseconds: 100));
    _state = WalletState.connected;
    _address = _availableAccounts.first.address;
    _testAccount = _availableAccounts.first;
    _authToken = 'test-auth-token';
    notifyListeners();
  }

  @override
  Future<void> disconnect() async {
    setDisconnected();
  }

  @override
  Future<void> connectTestAccount(TestAccount account) async {
    setConnected(account.address, account: account);
  }

  @override
  Future<String> signMessage(String message) async {
    if (!isConnected) throw Exception('Wallet not connected');
    return '0x${List.filled(130, 'a').join()}'; // Mock signature
  }

  @override
  Future<Uint8List> signTypedData(Map<String, dynamic> typedData) async {
    if (!isConnected) throw Exception('Wallet not connected');
    return Uint8List.fromList(List<int>.filled(65, 0xab)); // Mock signature bytes
  }

  @override
  Future<TransactionResult> sendTransaction({
    required String to,
    required String data,
    String value = '0',
  }) async {
    if (!isConnected) throw Exception('Wallet not connected');
    // Return a mock TransactionResult
    return TransactionResult(
      hash: '0x${List.filled(64, 'b').join()}',
      blockNumber: 12345,
      gasUsed: '21000',
      status: 'success',
    );
  }

  @override
  bool get canSignTransactions => isConnected;

  // Fee simulation (simplified)
  @override
  List<FeeTransaction> get feeTransactions => List.unmodifiable(_feeTransactions);
  @override
  BigInt get platformBalance => _simulatedBalances[platformWallet.address] ?? BigInt.zero;
  @override
  BigInt get currentBalance => _address != null ? getSimulatedBalance(_address!) : BigInt.zero;
  @override
  bool get hasActiveSubscription {
    if (_address == null) return false;
    final expiry = _subscriptionExpiry[_address!];
    return expiry != null && expiry.isAfter(DateTime.now());
  }
  @override
  DateTime? get subscriptionExpiry => _address != null ? _subscriptionExpiry[_address!] : null;
  @override
  List<FeeTransaction> get userFeeTransactions => [];
  @override
  BigInt get totalFeesPaid => BigInt.zero;
  @override
  BigInt get totalPlatformRevenue => BigInt.zero;

  @override
  void initializeSimulatedBalances() {
    final startingBalance = BigInt.from(10) * BigInt.from(10).pow(18);
    for (final account in _availableAccounts) {
      _simulatedBalances[account.address] = startingBalance;
    }
    _simulatedBalances[platformWallet.address] = BigInt.zero;
    notifyListeners();
  }

  @override
  BigInt getSimulatedBalance(String address) => _simulatedBalances[address] ?? BigInt.zero;

  @override
  Future<bool> paySubscriptionFee() async => true;
  @override
  Future<bool> payMintFee() async => true;
  @override
  Future<bool> payAiGenerationFee() async => true;
  @override
  void resetFeeSimulation() {}

  @override
  TestAccount? getAccountByNickname(String nickname) {
    final lower = nickname.toLowerCase();
    try {
      return _availableAccounts.firstWhere((a) => a.nickname.toLowerCase() == lower);
    } catch (_) {
      return null;
    }
  }

  @override
  List<TestAccount> get allAccounts => [platformWallet, ..._availableAccounts];

  // Required by WalletProvider but not needed in most tests
  @override
  WalletService get walletService => throw UnimplementedError('Use TestWalletProvider for testing');
}

/// Creates a TestWalletProvider connected as Alice
TestWalletProvider connectedAsAlice() {
  return TestWalletProvider(
    connected: true,
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    testAccount: const TestAccount(
      'Account #2',
      'Alice',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    ),
  );
}

/// Creates a TestWalletProvider connected as Bob
TestWalletProvider connectedAsBob() {
  return TestWalletProvider(
    connected: true,
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    testAccount: const TestAccount(
      'Account #3',
      'Bob',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    ),
  );
}

/// Creates a disconnected TestWalletProvider
TestWalletProvider disconnected() {
  return TestWalletProvider(connected: false);
}

/// Helper to build a minimal test widget with providers
Widget buildTestWidget(
  Widget child, {
  WalletProvider? walletProvider,
  MintProvider? mintProvider,
}) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<WalletProvider>.value(
        value: walletProvider ?? TestWalletProvider(),
      ),
      ChangeNotifierProxyProvider<WalletProvider, MintProvider>(
        create: (_) => mintProvider ?? MintProvider(),
        update: (_, wallet, mint) => mint!..updateWallet(wallet),
      ),
    ],
    child: MaterialApp(
      theme: NFTmarketTheme.dark,
      home: child,
    ),
  );
}

/// Helper to pump widget and let initial async operations settle
extension WidgetTesterExtension on WidgetTester {
  /// Pumps the widget and waits for animations/async to settle
  Future<void> pumpAndSettle2({
    Duration duration = const Duration(milliseconds: 100),
    EnginePhase phase = EnginePhase.sendSemanticsUpdate,
    Duration timeout = const Duration(minutes: 10),
  }) async {
    await pump(duration);
    await pumpAndSettle(duration, phase, timeout);
  }
}
