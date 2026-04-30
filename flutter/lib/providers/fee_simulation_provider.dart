import 'package:flutter/foundation.dart';

import '../models/test_account.dart';

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

/// Manages simulated fee state for local development testing.
///
/// Extracted from WalletProvider to follow Single Responsibility Principle.
/// Receives the current user address via [updateAddress] when wallet state changes.
class FeeSimulationProvider extends ChangeNotifier {
  String? _address;
  final Map<String, BigInt> _simulatedBalances = {};
  final List<FeeTransaction> _feeTransactions = [];
  final Map<String, DateTime> _subscriptionExpiry = {};

  // Getters
  List<FeeTransaction> get feeTransactions =>
      List.unmodifiable(_feeTransactions);
  BigInt get platformBalance =>
      _simulatedBalances[platformWallet.address] ?? BigInt.zero;

  BigInt get currentBalance {
    if (_address == null) return BigInt.zero;
    return getSimulatedBalance(_address!);
  }

  bool get hasActiveSubscription {
    if (_address == null) return false;
    final expiry = _subscriptionExpiry[_address!];
    if (expiry == null) return false;
    return expiry.isAfter(DateTime.now());
  }

  DateTime? get subscriptionExpiry {
    if (_address == null) return null;
    return _subscriptionExpiry[_address!];
  }

  List<FeeTransaction> get userFeeTransactions {
    if (_address == null) return [];
    return _feeTransactions.where((t) => t.fromAddress == _address).toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
  }

  BigInt get totalFeesPaid {
    if (_address == null) return BigInt.zero;
    return _feeTransactions
        .where((t) => t.fromAddress == _address)
        .fold(BigInt.zero, (sum, t) => sum + t.amount);
  }

  BigInt get totalPlatformRevenue {
    return _feeTransactions.fold(BigInt.zero, (sum, t) => sum + t.amount);
  }

  /// Called by the provider wiring when wallet address changes.
  void updateAddress(String? address) {
    _address = address;
  }

  /// Get simulated balance for an address
  BigInt getSimulatedBalance(String address) {
    return _simulatedBalances[address] ?? BigInt.zero;
  }

  /// Initialize simulated balances for a list of test accounts
  void initializeSimulatedBalances(List<TestAccount> accounts) {
    final startingBalance = BigInt.from(10) * BigInt.from(10).pow(18);
    for (final account in accounts) {
      _simulatedBalances[account.address] = startingBalance;
    }
    _simulatedBalances[platformWallet.address] = BigInt.zero;
    notifyListeners();
  }

  /// Pay subscription fee
  Future<bool> paySubscriptionFee() async {
    final result = await _payFee(
      type: FeeType.subscription,
      amount: FeeConfig.subscriptionFee,
      idPrefix: 'sub',
      description: 'Monthly subscription fee',
      errorMessage: 'Insufficient balance for subscription',
    );
    if (result && _address != null) {
      _subscriptionExpiry[_address!] =
          DateTime.now().add(const Duration(days: 30));
    }
    return result;
  }

  /// Pay mint fee
  Future<bool> payMintFee() => _payFee(
        type: FeeType.mint,
        amount: FeeConfig.mintFee,
        idPrefix: 'mint',
        description: 'NFT minting fee',
        errorMessage: 'Insufficient balance for minting',
      );

  /// Pay AI generation fee
  Future<bool> payAiGenerationFee() => _payFee(
        type: FeeType.aiGeneration,
        amount: FeeConfig.aiGenerationFee,
        idPrefix: 'ai',
        description: 'AI image generation fee',
        errorMessage: 'Insufficient balance for AI generation',
      );

  /// Reset fee simulation state
  void resetFeeSimulation(List<TestAccount> accounts) {
    _simulatedBalances.clear();
    _feeTransactions.clear();
    _subscriptionExpiry.clear();
    initializeSimulatedBalances(accounts);
  }

  /// Core fee payment logic — deducts from user, credits platform, records transaction.
  Future<bool> _payFee({
    required FeeType type,
    required BigInt amount,
    required String idPrefix,
    required String description,
    required String errorMessage,
  }) async {
    if (_address == null) return false;

    final balance = getSimulatedBalance(_address!);
    if (balance < amount) return false;

    _simulatedBalances[_address!] = balance - amount;
    _simulatedBalances[platformWallet.address] =
        (_simulatedBalances[platformWallet.address] ?? BigInt.zero) + amount;

    _feeTransactions.add(FeeTransaction(
      id: '${idPrefix}_${DateTime.now().millisecondsSinceEpoch}',
      type: type,
      fromAddress: _address!,
      amount: amount,
      timestamp: DateTime.now(),
      description: description,
    ));

    notifyListeners();
    return true;
  }
}
