import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';

void main() {
  group('NFTmarketApp', () {
    testWidgets('app renders without crashing', (tester) async {
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider(create: (_) => WalletProvider()),
            ChangeNotifierProxyProvider<WalletProvider, MintProvider>(
              create: (_) => MintProvider(),
              update: (_, wallet, mint) => mint!..updateWallet(wallet),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: Center(child: Text('NFTmarket')),
            ),
          ),
        ),
      );

      expect(find.text('NFTmarket'), findsOneWidget);
    });
  });

  group('WalletProvider', () {
    test('initial state is not connected', () {
      final provider = WalletProvider();
      expect(provider.isConnected, isFalse);
    });
  });
}
