import 'package:flutter_test/flutter_test.dart';
import 'package:nftmarket/providers/wallet_provider.dart';

void main() {
  group('WalletProvider', () {
    late WalletProvider provider;

    setUp(() {
      provider = WalletProvider();
    });

    tearDown(() {
      provider.disconnect();
    });

    group('Initial State', () {
      test('starts disconnected', () {
        expect(provider.state, equals(WalletState.disconnected));
        expect(provider.isConnected, isFalse);
        expect(provider.address, isNull);
        expect(provider.authToken, isNull);
      });

      test('shortAddress returns empty when not connected', () {
        expect(provider.shortAddress, equals(''));
      });
    });

    group('Test Account Connection', () {
      test('connects with test account', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);

        expect(provider.isConnected, isTrue);
        expect(provider.state, equals(WalletState.connected));
        expect(provider.address, equals(hardhatAccounts[0].address));
        expect(provider.testAccount, isNotNull);
      });

      test('creates auth token on connect', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);

        expect(provider.authToken, isNotNull);
        expect(provider.authToken!.isNotEmpty, isTrue);
      });

      test('shortAddress formats correctly', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);

        final short = provider.shortAddress;
        expect(short, contains('...'));
        expect(short.length, lessThan(provider.address!.length));
      });

      test('can switch accounts', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);
        final firstAddress = provider.address;

        await provider.disconnect();
        await provider.connectTestAccount(hardhatAccounts[1]);

        expect(provider.address, isNot(equals(firstAddress)));
        expect(provider.address, equals(hardhatAccounts[1].address));
      });
    });

    group('Disconnection', () {
      test('clears state on disconnect', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);
        await provider.disconnect();

        expect(provider.isConnected, isFalse);
        expect(provider.address, isNull);
        expect(provider.authToken, isNull);
        expect(provider.testAccount, isNull);
      });
    });

    group('Signing', () {
      test('signMessage requires connection', () async {
        expect(
          () => provider.signMessage('test'),
          throwsException,
        );
      });

      test('signMessage works when connected', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);
        final signature = await provider.signMessage('test message');

        expect(signature, startsWith('0x'));
        expect(signature.length, greaterThan(2));
      });

      test('getCredentials returns null when disconnected', () {
        expect(provider.getCredentials(), isNull);
      });

      test('getCredentials returns credentials when connected', () async {
        await provider.connectTestAccount(hardhatAccounts[0]);
        final credentials = provider.getCredentials();

        expect(credentials, isNotNull);
      });
    });
  });

  group('Hardhat Test Accounts', () {
    test('has 5 named test accounts', () {
      expect(hardhatAccounts.length, equals(5));
    });

    test('accounts have nicknames: Alice, Bob, Sam, Joe, Mary', () {
      final nicknames = hardhatAccounts.map((a) => a.nickname).toList();
      expect(nicknames, equals(['Alice', 'Bob', 'Sam', 'Joe', 'Mary']));
    });

    test('accounts have valid addresses', () {
      for (final account in hardhatAccounts) {
        expect(account.address, startsWith('0x'));
        expect(account.address.length, equals(42));
      }
    });

    test('accounts have valid private keys', () {
      for (final account in hardhatAccounts) {
        expect(account.privateKey, startsWith('0x'));
        expect(account.privateKey.length, equals(66));
      }
    });

    test('accounts have unique addresses', () {
      final addresses = hardhatAccounts.map((a) => a.address).toSet();
      expect(addresses.length, equals(hardhatAccounts.length));
    });

    test('getAccountByNickname finds correct account', () {
      final alice = WalletProvider.getAccountByNickname('Alice');
      expect(alice, isNotNull);
      expect(alice!.nickname, equals('Alice'));
      expect(alice.address, equals('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'));

      final bob = WalletProvider.getAccountByNickname('bob'); // case insensitive
      expect(bob, isNotNull);
      expect(bob!.nickname, equals('Bob'));
    });

    test('getAccountByNickname returns null for unknown', () {
      final unknown = WalletProvider.getAccountByNickname('Unknown');
      expect(unknown, isNull);
    });
  });

  group('Platform Wallet', () {
    test('platform wallet exists', () {
      expect(platformWallet, isNotNull);
      expect(platformWallet.isPlatform, isTrue);
    });

    test('platform wallet has valid address', () {
      expect(platformWallet.address, startsWith('0x'));
      expect(platformWallet.address.length, equals(42));
    });

    test('platform wallet nickname is Platform', () {
      expect(platformWallet.nickname, equals('Platform'));
    });

    test('allAccounts includes platform and user accounts', () {
      final all = WalletProvider.allAccounts;
      expect(all.length, equals(6)); // 1 platform + 5 users
      expect(all.first, equals(platformWallet));
    });
  });

  group('Fee Simulation', () {
    test('FeeConfig has correct values', () {
      // Subscription: 0.01 ETH
      expect(FeeConfig.subscriptionFee, equals(BigInt.from(10000000000000000)));
      // Mint: 0.001 ETH
      expect(FeeConfig.mintFee, equals(BigInt.from(1000000000000000)));
      // AI Generation: 0.0005 ETH
      expect(FeeConfig.aiGenerationFee, equals(BigInt.from(500000000000000)));
    });

    test('FeeConfig.formatEth formats correctly', () {
      // 1 ETH
      final oneEth = BigInt.from(10).pow(18);
      expect(FeeConfig.formatEth(oneEth), contains('1.'));

      // 0.01 ETH
      expect(FeeConfig.formatEth(FeeConfig.subscriptionFee), contains('0.'));
    });

    test('initializeSimulatedBalances sets starting balances', () {
      final provider = WalletProvider();
      provider.initializeSimulatedBalances();

      // Each user should have 10 ETH
      final tenEth = BigInt.from(10) * BigInt.from(10).pow(18);
      for (final account in hardhatAccounts) {
        expect(provider.getSimulatedBalance(account.address), equals(tenEth));
      }

      // Platform starts at 0
      expect(provider.getSimulatedBalance(platformWallet.address), equals(BigInt.zero));
    });

    test('fee transactions start empty', () {
      final provider = WalletProvider();
      expect(provider.feeTransactions, isEmpty);
    });
  });
}
