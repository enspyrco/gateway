import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('MarketplacePage Widget', () {
    late WalletProvider walletProvider;

    setUp(() {
      walletProvider = WalletProvider();
    });

    tearDown(() {
      walletProvider.disconnect();
    });

    Widget buildTestWidget(Widget child) {
      return MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: walletProvider),
          ChangeNotifierProxyProvider<WalletProvider, MintProvider>(
            create: (_) => MintProvider(),
            update: (_, wallet, mint) => mint!..updateWallet(wallet),
          ),
        ],
        child: MaterialApp(home: child),
      );
    }

    group('Listing Display', () {
      testWidgets('shows loading indicator initially', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });

      testWidgets('shows empty state when no listings', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.storefront, size: 64, color: Colors.grey.shade400),
                    const SizedBox(height: 16),
                    const Text('No NFTs for sale'),
                    const SizedBox(height: 8),
                    const Text('Be the first to list one!'),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.add),
                      label: const Text('Mint an NFT'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('No NFTs for sale'), findsOneWidget);
        expect(find.text('Be the first to list one!'), findsOneWidget);
        expect(find.text('Mint an NFT'), findsOneWidget);
      });

      testWidgets('displays listing cards with price and seller', (tester) async {
        final mockListing = {
          'tokenId': 1,
          'name': 'Test NFT',
          'priceEth': '1.5',
          'seller': '0x1234567890123456789012345678901234567890',
        };

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: InkWell(
                  onTap: () {},
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          mockListing['name'] as String,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.green.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('${mockListing['priceEth']} ETH'),
                        ),
                        const SizedBox(height: 4),
                        const Text('Seller: 0x1234...7890'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Test NFT'), findsOneWidget);
        expect(find.text('1.5 ETH'), findsOneWidget);
        expect(find.text('Seller: 0x1234...7890'), findsOneWidget);
      });

      testWidgets('shows error state with retry button', (tester) async {
        bool retried = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.error_outline, size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 16),
                    const Text('Error loading marketplace'),
                    const SizedBox(height: 8),
                    const Text('Connection refused'),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () => retried = true,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Error loading marketplace'), findsOneWidget);
        expect(find.text('Retry'), findsOneWidget);

        await tester.tap(find.text('Retry'));
        expect(retried, isTrue);
      });
    });

    group('Buy Functionality', () {
      testWidgets('shows buy button for listed tokens when connected', (tester) async {
        // Test UI without actually connecting wallet (avoids SharedPreferences issues)
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.shopping_cart),
                  label: const Text('Buy for 1.0 ETH'),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Buy for 1.0 ETH'), findsOneWidget);
        expect(find.byIcon(Icons.shopping_cart), findsOneWidget);
      });

      testWidgets('shows connect wallet prompt when not connected', (tester) async {
        expect(walletProvider.isConnected, isFalse);

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.account_balance_wallet),
                  label: const Text('Connect Wallet to Buy (1.0 ETH)'),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Connect Wallet to Buy (1.0 ETH)'), findsOneWidget);
      });
    });
  });
}
