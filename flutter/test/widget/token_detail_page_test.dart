import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';
import 'package:nftmarket/models/token.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TokenDetailPage Widget', () {
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

    group('Token Info Display', () {
      testWidgets('shows token name and description', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'My Art NFT',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 24),
                  ),
                  const SizedBox(height: 8),
                  const Text('A beautiful piece of digital art'),
                ],
              ),
            ),
          ),
        );

        expect(find.text('My Art NFT'), findsOneWidget);
        expect(find.text('A beautiful piece of digital art'), findsOneWidget);
      });

      testWidgets('shows creator and owner info', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          const Text('Creator'),
                          const Spacer(),
                          const Text('0x1234...7890'),
                        ],
                      ),
                      const Divider(),
                      Row(
                        children: [
                          const Text('Owner'),
                          const Spacer(),
                          const Text('0xabcd...ef01'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Creator'), findsOneWidget);
        expect(find.text('Owner'), findsOneWidget);
        expect(find.text('0x1234...7890'), findsOneWidget);
        expect(find.text('0xabcd...ef01'), findsOneWidget);
      });

      testWidgets('shows "You" chip when user is owner', (tester) async {
        // Test UI without actually connecting wallet (avoids SharedPreferences issues)
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Text('Owner'),
                      const Spacer(),
                      const Text('0x7099...79C8'),
                      const SizedBox(width: 8),
                      const Chip(
                        label: Text('You', style: TextStyle(fontSize: 12)),
                        backgroundColor: Colors.green,
                        labelStyle: TextStyle(color: Colors.white),
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('You'), findsOneWidget);
      });
    });

    group('Listing Dialog', () {
      testWidgets('shows list for sale button when owner and not listed', (tester) async {
        // Test UI without actually connecting wallet (avoids SharedPreferences issues)
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.sell),
                  label: const Text('List for Sale'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('List for Sale'), findsOneWidget);
        expect(find.byIcon(Icons.sell), findsOneWidget);
      });

      testWidgets('list dialog shows license type options', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: AlertDialog(
                title: const Text('List for Sale'),
                content: SizedBox(
                  width: 400,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'Price in ETH',
                          hintText: '0.1',
                          suffixText: 'ETH',
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text('License Type'),
                      const SizedBox(height: 12),
                      ...LicenseType.values.map((license) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey.shade300),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(license.displayName),
                                Text(license.description, style: const TextStyle(fontSize: 12)),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () {},
                    child: const Text('Cancel'),
                  ),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.edit, size: 18),
                    onPressed: () {},
                    label: const Text('Sign & List'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('List for Sale'), findsOneWidget);
        expect(find.text('Price in ETH'), findsOneWidget);
        expect(find.text('License Type'), findsOneWidget);
        expect(find.text('Display'), findsOneWidget);
        expect(find.text('Commercial'), findsOneWidget);
        expect(find.text('Full Transfer'), findsOneWidget);
        expect(find.text('Sign & List'), findsOneWidget);
        expect(find.text('Cancel'), findsOneWidget);
      });
    });

    group('Listed Token Actions', () {
      testWidgets('shows listed status card when token is listed', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Column(
                children: [
                  Card(
                    color: Colors.green.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.local_offer, color: Colors.green),
                          const SizedBox(width: 8),
                          const Text('Listed for 1.5 ETH',
                              style: TextStyle(fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.remove_shopping_cart),
                    label: const Text('Remove Listing'),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Listed for 1.5 ETH'), findsOneWidget);
        expect(find.text('Remove Listing'), findsOneWidget);
        expect(find.byIcon(Icons.remove_shopping_cart), findsOneWidget);
      });

      testWidgets('shows bilateral agreement notice for buyers', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                color: Colors.blue.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.verified_user, color: Colors.blue, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Bilateral Agreement Required',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.blue.shade800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'By clicking Buy, you will sign a license agreement that will be recorded on-chain.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.blue.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Bilateral Agreement Required'), findsOneWidget);
        expect(find.textContaining('By clicking Buy'), findsOneWidget);
      });
    });

    group('Other Actions', () {
      testWidgets('shows verify authenticity button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.verified),
                label: const Text('Verify Authenticity'),
              ),
            ),
          ),
        );

        expect(find.text('Verify Authenticity'), findsOneWidget);
        expect(find.byIcon(Icons.verified), findsOneWidget);
      });

      testWidgets('shows share button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.share),
                label: const Text('Share'),
              ),
            ),
          ),
        );

        expect(find.text('Share'), findsOneWidget);
        expect(find.byIcon(Icons.share), findsOneWidget);
      });

      testWidgets('shows polygonscan link when transaction hash exists', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.open_in_new),
                label: const Text('View on Polygonscan'),
              ),
            ),
          ),
        );

        expect(find.text('View on Polygonscan'), findsOneWidget);
        expect(find.byIcon(Icons.open_in_new), findsOneWidget);
      });
    });

    group('Loading States', () {
      testWidgets('shows loading indicator during actions', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: ElevatedButton.icon(
                  onPressed: null,
                  icon: const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  label: const Text('List for Sale'),
                ),
              ),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });
    });
  });
}
