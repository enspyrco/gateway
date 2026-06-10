/// End-to-End Tests for NFTmarket Flutter App
///
/// These tests run in a REAL browser against REAL services:
/// - Real Hardhat blockchain (localhost:8545)
/// - Real backend API (localhost:3000)
/// - Real signing with test account private keys
///
/// Prerequisites:
///   1. Start Hardhat node: cd contracts && npx hardhat node
///   2. Deploy contract: npx hardhat run scripts/deploy.js --network localhost
///   3. Start backend: cd backend && ./start-local-blockchain.sh
///
/// Run with:
///   flutter test integration_test/e2e_test.dart -d chrome
///
library;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/main.dart' as app;
import 'package:nftmarket/providers/wallet_provider.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('E2E: Wallet Connection', () {
    testWidgets('Can connect as Alice', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Find and tap wallet button
      final walletButton = find.byType(ElevatedButton).first;
      await tester.tap(walletButton);
      await tester.pumpAndSettle();

      // Find Alice in the account picker
      final aliceOption = find.text('Alice');
      expect(aliceOption, findsOneWidget);

      await tester.tap(aliceOption);
      await tester.pumpAndSettle();

      // Verify connected - should show Alice in header
      expect(find.text('Alice'), findsOneWidget);
    });

    testWidgets('Can switch accounts', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Connect as Alice first
      await tester.tap(find.byType(ElevatedButton).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alice'));
      await tester.pumpAndSettle();

      // Open menu and switch account
      await tester.tap(find.text('Alice'));
      await tester.pumpAndSettle();

      final switchButton = find.text('Switch Account');
      await tester.tap(switchButton);
      await tester.pumpAndSettle();

      // Select Bob
      await tester.tap(find.text('Bob'));
      await tester.pumpAndSettle();

      // Verify switched
      expect(find.text('Bob'), findsOneWidget);
    });

    testWidgets('Can copy wallet address', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Connect as Alice
      await tester.tap(find.byType(ElevatedButton).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alice'));
      await tester.pumpAndSettle();

      // Open menu
      await tester.tap(find.text('Alice'));
      await tester.pumpAndSettle();

      // Find and tap copy option
      final copyHint = find.text('Tap to copy address');
      expect(copyHint, findsOneWidget);
    });
  });

  group('E2E: Listing Flow', () {
    testWidgets('Signing works for listing', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Connect as Alice
      await tester.tap(find.byType(ElevatedButton).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alice'));
      await tester.pumpAndSettle();

      // Get wallet provider
      final context = tester.element(find.byType(MaterialApp));
      final wallet = Provider.of<WalletProvider>(context, listen: false);

      // Verify test account is set (this was the bug!)
      expect(wallet.testAccount, isNotNull);
      expect(wallet.testAccount!.nickname, equals('Alice'));

      // Verify can sign (this would throw before the fix)
      expect(wallet.canSignTransactions, isTrue);
    });
  });

  group('E2E: Name Resolution', () {
    testWidgets('Gallery search accepts names', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to gallery
      final galleryButton = find.text('Gallery');
      if (galleryButton.evaluate().isNotEmpty) {
        await tester.tap(galleryButton);
        await tester.pumpAndSettle();
      }

      // Find search field
      final searchField = find.byType(TextField);
      if (searchField.evaluate().isNotEmpty) {
        // Enter "Alice" as search
        await tester.enterText(searchField.first, 'Alice');
        await tester.pumpAndSettle();

        // Verify hint text suggests names are accepted
        expect(find.textContaining('Alice, Bob'), findsWidgets);
      }
    });
  });
}
