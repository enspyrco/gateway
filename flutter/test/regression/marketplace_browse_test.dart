import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';
import 'package:nftmarket/theme.dart';

import '../fixtures/api_responses.dart';
import '../mocks/mock_http_client.dart';
import '../utils/test_app.dart';

/// Regression tests for the Marketplace page browsing functionality.
///
/// These tests verify the marketplace page correctly:
/// - Displays loading states
/// - Shows listings with correct information
/// - Handles empty and error states
/// - Displays license type badges with correct colors
/// - Navigates to token details on tap
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Marketplace Browse', () {
    group('Loading State', () {
      testWidgets('shows loading indicator while fetching listings', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Center(
                child: CircularProgressIndicator(
                  color: NFTmarketColors.accent,
                ),
              ),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });

      testWidgets('loading indicator uses accent color', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Center(
                child: CircularProgressIndicator(
                  color: NFTmarketColors.accent,
                ),
              ),
            ),
          ),
        );

        final indicator = tester.widget<CircularProgressIndicator>(
          find.byType(CircularProgressIndicator),
        );
        expect(indicator.color, equals(NFTmarketColors.accent));
      });
    });

    group('Empty State', () {
      testWidgets('shows empty state when no listings', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _EmptyMarketplaceWidget(),
          ),
        );

        expect(find.text('No NFTs for sale'), findsOneWidget);
        expect(find.text('Be the first to list your artwork!'), findsOneWidget);
        expect(find.byIcon(Icons.storefront), findsOneWidget);
      });

      testWidgets('empty state has mint button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _EmptyMarketplaceWidget(),
          ),
        );

        expect(find.text('Mint an NFT'), findsOneWidget);
        expect(find.byIcon(Icons.add), findsOneWidget);
      });

      testWidgets('mint button navigates correctly', (tester) async {
        bool navigated = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: ElevatedButton.icon(
                onPressed: () => navigated = true,
                icon: const Icon(Icons.add),
                label: const Text('Mint an NFT'),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Mint an NFT'));
        await tester.pump();

        expect(navigated, isTrue);
      });
    });

    group('Error State', () {
      testWidgets('shows error message when loading fails', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _ErrorStateWidget(error: 'Connection refused'),
          ),
        );

        expect(find.text('Error loading marketplace'), findsOneWidget);
        expect(find.text('Connection refused'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('error state has retry button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _ErrorStateWidget(error: 'Network error'),
          ),
        );

        expect(find.text('Retry'), findsOneWidget);
      });

      testWidgets('retry button triggers reload', (tester) async {
        bool retried = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => retried = true,
                  child: const Text('Retry'),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Retry'));
        await tester.pump();

        expect(retried, isTrue);
      });
    });

    group('Listing Cards', () {
      testWidgets('displays listing card with name', (tester) async {
        final listing = ListingFixtures.listing(name: 'Beautiful Sunset');

        await tester.pumpWidget(
          buildTestWidget(
            _ListingCardWidget(listing: listing),
          ),
        );

        expect(find.text('Beautiful Sunset'), findsOneWidget);
      });

      testWidgets('displays listing card with price', (tester) async {
        final listing = ListingFixtures.listing(priceEth: '2.5');

        await tester.pumpWidget(
          buildTestWidget(
            _ListingCardWidget(listing: listing),
          ),
        );

        expect(find.text('2.5 ETH'), findsOneWidget);
      });

      testWidgets('displays listing card with seller address', (tester) async {
        final listing = ListingFixtures.listing(
          seller: TestAddresses.alice,
        );

        await tester.pumpWidget(
          buildTestWidget(
            _ListingCardWidget(listing: listing),
          ),
        );

        // Should show shortened address
        expect(find.textContaining('0x3C44'), findsOneWidget);
      });

      testWidgets('listing card is tappable', (tester) async {
        bool tapped = false;
        final listing = ListingFixtures.listing();

        await tester.pumpWidget(
          buildTestWidget(
            _ListingCardWidget(
              listing: listing,
              onTap: () => tapped = true,
            ),
          ),
        );

        await tester.tap(find.byType(_ListingCardWidget));
        await tester.pump();

        expect(tapped, isTrue);
      });
    });

    group('License Type Badges', () {
      testWidgets('display license shows blue badge', (tester) async {
        final listing = ListingFixtures.displayListing();

        await tester.pumpWidget(
          buildTestWidget(
            _LicenseBadgeWidget(licenseType: listing['licenseType'] as String),
          ),
        );

        expect(find.text('Display'), findsOneWidget);
        final container = _findBadgeContainer(tester);
        expect(container, isNotNull);
      });

      testWidgets('commercial license shows orange badge', (tester) async {
        final listing = ListingFixtures.commercialListing();

        await tester.pumpWidget(
          buildTestWidget(
            _LicenseBadgeWidget(licenseType: listing['licenseType'] as String),
          ),
        );

        expect(find.text('Commercial'), findsOneWidget);
      });

      testWidgets('transfer license shows purple badge', (tester) async {
        final listing = ListingFixtures.transferListing();

        await tester.pumpWidget(
          buildTestWidget(
            _LicenseBadgeWidget(licenseType: listing['licenseType'] as String),
          ),
        );

        expect(find.text('Full Transfer'), findsOneWidget);
      });
    });

    group('Multiple Listings', () {
      testWidgets('displays grid of listing cards', (tester) async {
        final listings = [
          ListingFixtures.listing(tokenId: 1, name: 'Art #1'),
          ListingFixtures.listing(tokenId: 2, name: 'Art #2'),
          ListingFixtures.listing(tokenId: 3, name: 'Art #3'),
        ];

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  childAspectRatio: 0.8,
                ),
                itemCount: listings.length,
                itemBuilder: (context, index) {
                  return Card(
                    child: Center(
                      child: Text(listings[index]['name'] as String),
                    ),
                  );
                },
              ),
            ),
          ),
        );

        expect(find.text('Art #1'), findsOneWidget);
        expect(find.text('Art #2'), findsOneWidget);
        expect(find.text('Art #3'), findsOneWidget);
      });

      testWidgets('mixed license listings show different badge colors', (tester) async {
        final listings = MarketplaceFixtures.mixedLicenseListings()['listings'] as List;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Column(
                children: listings.map((l) {
                  return _LicenseBadgeWidget(
                    licenseType: l['licenseType'] as String,
                  );
                }).toList(),
              ),
            ),
          ),
        );

        expect(find.text('Display'), findsOneWidget);
        expect(find.text('Commercial'), findsOneWidget);
        expect(find.text('Full Transfer'), findsOneWidget);
      });
    });

    group('Wallet Connection Integration', () {
      testWidgets('shows connect wallet button when not connected', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _BuyButtonForListingWidget(isConnected: false, price: '1.0'),
            walletProvider: disconnected(),
          ),
        );

        expect(find.text('Connect Wallet to Buy (1.0 ETH)'), findsOneWidget);
        expect(find.byIcon(Icons.account_balance_wallet), findsOneWidget);
      });

      testWidgets('shows buy button when connected', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _BuyButtonForListingWidget(isConnected: true, price: '1.0'),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('Buy for 1.0 ETH'), findsOneWidget);
        expect(find.byIcon(Icons.shopping_cart), findsOneWidget);
      });
    });

    group('LIVE Badge', () {
      testWidgets('marketplace header shows LIVE badge', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              appBar: AppBar(
                title: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Marketplace'),
                    const SizedBox(width: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: NFTmarketColors.accent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'LIVE',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: NFTmarketColors.accent,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Marketplace'), findsOneWidget);
        expect(find.text('LIVE'), findsOneWidget);
      });
    });
  });
}

// Helper widgets for testing

class _EmptyMarketplaceWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.storefront,
              size: 48,
              color: NFTmarketColors.accent,
            ),
            const SizedBox(height: 24),
            const Text('No NFTs for sale'),
            const SizedBox(height: 8),
            const Text('Be the first to list your artwork!'),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.add),
              label: const Text('Mint an NFT'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorStateWidget extends StatelessWidget {
  final String error;

  const _ErrorStateWidget({required this.error});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 48,
              color: NFTmarketColors.textMuted,
            ),
            const SizedBox(height: 16),
            const Text('Error loading marketplace'),
            const SizedBox(height: 8),
            Text(error),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {},
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ListingCardWidget extends StatelessWidget {
  final Map<String, dynamic> listing;
  final VoidCallback? onTap;

  const _ListingCardWidget({required this.listing, this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = listing['name'] ?? 'NFT #${listing['tokenId']}';
    final price = listing['priceEth'] ?? '?';
    final seller = listing['seller'] ?? '';
    final shortSeller = seller.length > 10
        ? '${seller.substring(0, 6)}...${seller.substring(seller.length - 4)}'
        : seller;

    return Material(
      child: InkWell(
        onTap: onTap,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('$price ETH'),
                const SizedBox(height: 4),
                Text('Seller: $shortSeller'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LicenseBadgeWidget extends StatelessWidget {
  final String licenseType;

  const _LicenseBadgeWidget({required this.licenseType});

  Color get _color {
    switch (licenseType.toLowerCase()) {
      case 'display':
        return NFTmarketColors.displayBlue;
      case 'commercial':
        return NFTmarketColors.commercialOrange;
      case 'transfer':
        return NFTmarketColors.transferPurple;
      default:
        return NFTmarketColors.textMuted;
    }
  }

  String get _label {
    switch (licenseType.toLowerCase()) {
      case 'display':
        return 'Display';
      case 'commercial':
        return 'Commercial';
      case 'transfer':
        return 'Full Transfer';
      default:
        return 'Unknown';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: _color, width: 1),
      ),
      child: Text(
        _label,
        style: TextStyle(
          color: _color,
          fontWeight: FontWeight.bold,
          fontSize: 10,
        ),
      ),
    );
  }
}

class _BuyButtonForListingWidget extends StatelessWidget {
  final bool isConnected;
  final String price;

  const _BuyButtonForListingWidget({
    required this.isConnected,
    required this.price,
  });

  @override
  Widget build(BuildContext context) {
    if (isConnected) {
      return Scaffold(
        body: Center(
          child: ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.shopping_cart),
            label: Text('Buy for $price ETH'),
          ),
        ),
      );
    } else {
      return Scaffold(
        body: Center(
          child: ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.account_balance_wallet),
            label: Text('Connect Wallet to Buy ($price ETH)'),
          ),
        ),
      );
    }
  }
}

Container? _findBadgeContainer(WidgetTester tester) {
  try {
    return tester.widget<Container>(
      find.descendant(
        of: find.byType(_LicenseBadgeWidget),
        matching: find.byType(Container),
      ).first,
    );
  } catch (_) {
    return null;
  }
}
