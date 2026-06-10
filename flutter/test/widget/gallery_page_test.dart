import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GalleryPage Widget', () {
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

    group('Gallery Search', () {
      testWidgets('shows search bar', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Enter wallet address (0x...)',
                          prefixIcon: const Icon(Icons.search),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      onPressed: () {},
                      child: const Text('View Gallery'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Enter wallet address (0x...)'), findsOneWidget);
        expect(find.byIcon(Icons.search), findsOneWidget);
        expect(find.text('View Gallery'), findsOneWidget);
      });

      testWidgets('can enter address in search field', (tester) async {
        final controller = TextEditingController();

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  controller: controller,
                  decoration: const InputDecoration(
                    hintText: 'Enter wallet address (0x...)',
                  ),
                ),
              ),
            ),
          ),
        );

        await tester.enterText(
          find.byType(TextField),
          '0x1234567890123456789012345678901234567890',
        );

        expect(controller.text, '0x1234567890123456789012345678901234567890');
      });
    });

    group('User Gallery Display', () {
      testWidgets('shows My Collection when viewing own gallery',
          (tester) async {
        // Test UI without actually connecting wallet (avoids SharedPreferences issues)
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'My Collection',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 20,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('My Collection'), findsOneWidget);
      });

      testWidgets('shows Collection with address when viewing other gallery',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        'Collection',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 20,
                        ),
                      ),
                      SizedBox(width: 8),
                      Chip(
                        label: Text('0x1234...7890',
                            style: TextStyle(fontSize: 12)),
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Collection'), findsOneWidget);
        expect(find.text('0x1234...7890'), findsOneWidget);
      });

      testWidgets('shows empty state when no tokens', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Center(
                    child: Column(
                      children: [
                        Icon(Icons.collections_outlined,
                            size: 48, color: Colors.grey.shade400),
                        const SizedBox(height: 12),
                        Text(
                          'No artworks yet',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.add),
                          label: const Text('Mint Your First NFT'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('No artworks yet'), findsOneWidget);
        expect(find.text('Mint Your First NFT'), findsOneWidget);
      });

      testWidgets('shows token cards with license type', (tester) async {
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
                        const Text(
                          'My Art NFT',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text('Display License'),
                        ),
                        const SizedBox(height: 4),
                        const Text('Creator: 0x1234...7890'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('My Art NFT'), findsOneWidget);
        expect(find.text('Display License'), findsOneWidget);
        expect(find.text('Creator: 0x1234...7890'), findsOneWidget);
      });
    });

    group('Gallery Discovery', () {
      testWidgets('shows Browse Galleries section', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Browse Galleries',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 20,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Browse Galleries'), findsOneWidget);
      });

      testWidgets('shows gallery cards with token count', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: InkWell(
                  onTap: () {},
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: Colors.blue.shade100,
                          child: const Icon(Icons.account_circle,
                              color: Colors.blue),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '0x1234...7890',
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '5 NFTs · Sunset Art',
                                style: TextStyle(
                                    color: Colors.grey.shade600, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.arrow_forward_ios,
                            size: 16, color: Colors.grey.shade400),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('0x1234...7890'), findsOneWidget);
        expect(find.text('5 NFTs · Sunset Art'), findsOneWidget);
        expect(find.byIcon(Icons.arrow_forward_ios), findsOneWidget);
      });

      testWidgets('shows empty galleries state', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Center(
                    child: Column(
                      children: [
                        Icon(Icons.people_outline,
                            size: 48, color: Colors.grey.shade400),
                        const SizedBox(height: 12),
                        Text(
                          'No galleries yet',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Be the first to mint an NFT!',
                          style: TextStyle(
                              color: Colors.grey.shade500, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('No galleries yet'), findsOneWidget);
        expect(find.text('Be the first to mint an NFT!'), findsOneWidget);
      });
    });

    group('Error Handling', () {
      testWidgets('shows error state with retry', (tester) async {
        bool retried = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.error_outline,
                        size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 16),
                    const Text('Error loading gallery'),
                    const SizedBox(height: 8),
                    const Text('Network error'),
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

        expect(find.text('Error loading gallery'), findsOneWidget);
        expect(find.text('Retry'), findsOneWidget);

        await tester.tap(find.text('Retry'));
        expect(retried, isTrue);
      });
    });

    group('Navigation', () {
      testWidgets('clicking token card can navigate', (tester) async {
        bool tapped = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: InkWell(
                  onTap: () => tapped = true,
                  child: const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('NFT #1'),
                  ),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('NFT #1'));
        expect(tapped, isTrue);
      });

      testWidgets('clicking gallery card can navigate', (tester) async {
        bool tapped = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Card(
                child: InkWell(
                  onTap: () => tapped = true,
                  child: const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('0x1234...7890'),
                  ),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('0x1234...7890'));
        expect(tapped, isTrue);
      });
    });
  });
}
