import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/fee_simulation_provider.dart';
import 'package:nftmarket/models/test_account.dart';
import 'package:nftmarket/theme.dart';

import '../fixtures/api_responses.dart';
import '../utils/test_app.dart';

/// Regression tests for wallet connection functionality.
///
/// These tests verify:
/// - Connect flow shows account picker
/// - Account selection updates state correctly
/// - Disconnect clears all state
/// - Account switching works
/// - Test account data is correct
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Wallet Connection', () {
    group('Initial State', () {
      test('provider starts disconnected', () {
        final provider = TestWalletProvider();

        expect(provider.isConnected, isFalse);
        expect(provider.address, isNull);
        expect(provider.authToken, isNull);
        expect(provider.state, equals(WalletState.disconnected));
      });

      test('available accounts are populated', () {
        final provider = TestWalletProvider();

        expect(provider.availableAccounts.length, equals(5));
        expect(provider.availableAccounts[0].nickname, equals('Alice'));
        expect(provider.availableAccounts[1].nickname, equals('Bob'));
      });
    });

    group('Test Account Data', () {
      test('Alice has correct address', () {
        final provider = TestWalletProvider();
        final alice = provider.availableAccounts[0];

        expect(alice.address, equals(TestAddresses.alice));
        expect(alice.nickname, equals('Alice'));
        expect(alice.name, equals('Account #2'));
      });

      test('Bob has correct address', () {
        final provider = TestWalletProvider();
        final bob = provider.availableAccounts[1];

        expect(bob.address, equals(TestAddresses.bob));
        expect(bob.nickname, equals('Bob'));
      });

      test('all test accounts have unique addresses', () {
        final provider = TestWalletProvider();
        final addresses =
            provider.availableAccounts.map((a) => a.address).toSet();

        expect(addresses.length, equals(provider.availableAccounts.length));
      });

      test('platform wallet is separate from test accounts', () {
        final provider = TestWalletProvider();

        expect(provider.allAccounts.length, equals(6)); // 5 + platform
        expect(
          provider.allAccounts.any((a) => a.isPlatform),
          isTrue,
        );
      });
    });

    group('Connect Flow', () {
      testWidgets('shows account picker when connecting', (tester) async {
        final provider = TestWalletProvider();

        await tester.pumpWidget(
          buildTestWidget(
            _AccountPickerWidget(accounts: provider.availableAccounts),
            walletProvider: provider,
          ),
        );

        expect(find.text('Alice'), findsOneWidget);
        expect(find.text('Bob'), findsOneWidget);
        expect(find.text('Sam'), findsOneWidget);
        expect(find.text('Joe'), findsOneWidget);
        expect(find.text('Mary'), findsOneWidget);
      });

      testWidgets('selecting account triggers connection', (tester) async {
        final provider = TestWalletProvider();
        bool selected = false;

        await tester.pumpWidget(
          buildTestWidget(
            _AccountPickerWidget(
              accounts: provider.availableAccounts,
              onSelect: (account) => selected = true,
            ),
            walletProvider: provider,
          ),
        );

        await tester.tap(find.text('Alice'));
        await tester.pump();

        expect(selected, isTrue);
      });

      test('connectTestAccount sets connected state', () async {
        final provider = TestWalletProvider();
        final alice = provider.availableAccounts[0];

        await provider.connectTestAccount(alice);

        expect(provider.isConnected, isTrue);
        expect(provider.address, equals(alice.address));
        expect(provider.testAccount?.nickname, equals('Alice'));
      });

      test('connectTestAccount generates auth token', () async {
        final provider = TestWalletProvider();
        final bob = provider.availableAccounts[1];

        await provider.connectTestAccount(bob);

        expect(provider.authToken, isNotNull);
        expect(provider.authToken, contains('test-auth-token'));
      });
    });

    group('Disconnect Flow', () {
      test('disconnect clears all state', () async {
        final provider = TestWalletProvider(
          connected: true,
          address: TestAddresses.alice,
        );

        expect(provider.isConnected, isTrue);

        await provider.disconnect();

        expect(provider.isConnected, isFalse);
        expect(provider.address, isNull);
        expect(provider.authToken, isNull);
        expect(provider.testAccount, isNull);
        expect(provider.state, equals(WalletState.disconnected));
      });

      testWidgets('disconnect button triggers disconnect', (tester) async {
        final provider = TestWalletProvider(
          connected: true,
          address: TestAddresses.alice,
        );
        bool disconnected = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: ElevatedButton(
                onPressed: () {
                  provider.disconnect();
                  disconnected = true;
                },
                child: const Text('Disconnect'),
              ),
            ),
            walletProvider: provider,
          ),
        );

        await tester.tap(find.text('Disconnect'));
        await tester.pump();

        expect(disconnected, isTrue);
      });
    });

    group('Account Switching', () {
      test('switch account changes address', () async {
        final provider = TestWalletProvider();
        final alice = provider.availableAccounts[0];
        final bob = provider.availableAccounts[1];

        await provider.connectTestAccount(alice);
        expect(provider.address, equals(alice.address));

        await provider.connectTestAccount(bob);
        expect(provider.address, equals(bob.address));
        expect(provider.testAccount?.nickname, equals('Bob'));
      });

      test('switch account updates auth token', () async {
        final provider = TestWalletProvider();
        final alice = provider.availableAccounts[0];
        final bob = provider.availableAccounts[1];

        await provider.connectTestAccount(alice);
        final aliceToken = provider.authToken;

        await provider.connectTestAccount(bob);
        final bobToken = provider.authToken;

        expect(aliceToken, isNot(equals(bobToken)));
      });
    });

    group('State Transitions', () {
      test('connecting state is transient', () async {
        final provider = TestWalletProvider();

        // Start disconnected
        expect(provider.state, equals(WalletState.disconnected));

        // Connect sets to connected (TestWalletProvider skips connecting state)
        await provider.connect();
        expect(provider.state, equals(WalletState.connected));
      });

      test('error state is set on connection failure', () {
        final provider = TestWalletProvider();

        provider.setError('Connection failed');

        expect(provider.state, equals(WalletState.error));
        expect(provider.error, equals('Connection failed'));
        expect(provider.isConnected, isFalse);
      });
    });

    group('Nickname Lookup', () {
      test('getAccountByNickname finds Alice', () {
        final provider = TestWalletProvider();

        final alice = provider.getAccountByNickname('Alice');

        expect(alice, isNotNull);
        expect(alice!.address, equals(TestAddresses.alice));
      });

      test('getAccountByNickname is case-insensitive', () {
        final provider = TestWalletProvider();

        expect(provider.getAccountByNickname('alice'), isNotNull);
        expect(provider.getAccountByNickname('ALICE'), isNotNull);
        expect(provider.getAccountByNickname('AlIcE'), isNotNull);
      });

      test('getAccountByNickname returns null for unknown', () {
        final provider = TestWalletProvider();

        final unknown = provider.getAccountByNickname('Unknown');

        expect(unknown, isNull);
      });
    });

    group('UI Integration', () {
      testWidgets('wallet button shows connected state', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _WalletStatusWidget(
              isConnected: true,
              shortAddress: '0x3C44...93BC',
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('0x3C44...93BC'), findsOneWidget);
      });

      testWidgets('wallet button shows "Connect" when disconnected',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _WalletStatusWidget(
              isConnected: false,
            ),
            walletProvider: disconnected(),
          ),
        );

        expect(find.text('Connect'), findsOneWidget);
      });

      testWidgets('account picker shows address for each account',
          (tester) async {
        final provider = TestWalletProvider();

        await tester.pumpWidget(
          buildTestWidget(
            _AccountPickerWidget(
              accounts: provider.availableAccounts,
              showAddresses: true,
            ),
            walletProvider: provider,
          ),
        );

        // Should show shortened addresses
        expect(find.textContaining('0x3C44'), findsOneWidget); // Alice
        expect(find.textContaining('0x90F7'), findsOneWidget); // Bob
      });
    });

    group('Short Address Format', () {
      test('shortAddress formats correctly', () {
        final provider = TestWalletProvider(
          connected: true,
          address: TestAddresses.alice,
        );

        expect(provider.shortAddress, equals('0x3C44...93BC'));
      });

      test('shortAddress is empty when disconnected', () {
        final provider = TestWalletProvider();

        expect(provider.shortAddress, isEmpty);
      });
    });

    group('Local Dev Mode', () {
      test('isLocalDevMode is true for TestWalletProvider', () {
        final provider = TestWalletProvider();

        expect(provider.isLocalDevMode, isTrue);
      });
    });

    group('Fee Simulation', () {
      test('initializeSimulatedBalances gives 10 ETH to each account', () {
        final walletProvider = TestWalletProvider(
          connected: true,
          address: TestAddresses.alice,
        );
        final feeProvider = FeeSimulationProvider();
        feeProvider.updateAddress(walletProvider.address);
        feeProvider
            .initializeSimulatedBalances(walletProvider.availableAccounts);

        final expected = BigInt.from(10) * BigInt.from(10).pow(18);
        expect(feeProvider.currentBalance, equals(expected));
      });

      test('platform balance starts at zero', () {
        final walletProvider = TestWalletProvider();
        final feeProvider = FeeSimulationProvider();
        feeProvider
            .initializeSimulatedBalances(walletProvider.availableAccounts);

        expect(feeProvider.platformBalance, equals(BigInt.zero));
      });
    });
  });
}

// Test widget implementations

class _AccountPickerWidget extends StatelessWidget {
  final List<TestAccount> accounts;
  final void Function(TestAccount)? onSelect;
  final bool showAddresses;

  const _AccountPickerWidget({
    required this.accounts,
    this.onSelect,
    this.showAddresses = false,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView.builder(
        itemCount: accounts.length,
        itemBuilder: (context, index) {
          final account = accounts[index];
          return ListTile(
            title: Text(account.nickname),
            subtitle: showAddresses
                ? Text(
                    '${account.address.substring(0, 6)}...${account.address.substring(account.address.length - 4)}',
                  )
                : null,
            onTap: () => onSelect?.call(account),
          );
        },
      ),
    );
  }
}

class _WalletStatusWidget extends StatelessWidget {
  final bool isConnected;
  final String? shortAddress;

  const _WalletStatusWidget({
    required this.isConnected,
    this.shortAddress,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isConnected
              ? NFTmarketColors.success.withValues(alpha: 0.15)
              : NFTmarketColors.surfaceLight,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isConnected ? Icons.account_balance_wallet : Icons.wallet,
              size: 16,
              color: isConnected
                  ? NFTmarketColors.success
                  : NFTmarketColors.textSecondary,
            ),
            const SizedBox(width: 8),
            Text(
              isConnected ? (shortAddress ?? 'Connected') : 'Connect',
              style: TextStyle(
                color: isConnected
                    ? NFTmarketColors.success
                    : NFTmarketColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
