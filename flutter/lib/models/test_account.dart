import '../services/wallet_service.dart';

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
