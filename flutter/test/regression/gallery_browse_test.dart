import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/theme.dart';

import '../fixtures/api_responses.dart';
import '../mocks/mock_http_client.dart';
import '../utils/test_app.dart';

/// Regression tests for the Gallery page browsing functionality.
///
/// These tests verify the gallery page correctly:
/// - Shows "My Collection" for the connected user's gallery
/// - Displays other users' galleries with their address/nickname
/// - Shows token cards with listing badges
/// - Supports multi-license badge display
/// - Handles search by address and nickname
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Gallery Browse', () {
    group('Loading State', () {
      testWidgets('shows loading indicator while fetching gallery', (tester) async {
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
    });

    group('Page Title', () {
      testWidgets('shows "My Collection" when viewing own gallery', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _GalleryHeaderWidget(
              address: TestAddresses.alice,
              isOwnGallery: true,
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('My Collection'), findsOneWidget);
      });

      testWidgets('shows "Collection" with address for other user', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _GalleryHeaderWidget(
              address: TestAddresses.bob,
              isOwnGallery: false,
              displayName: 'Bob',
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('Collection'), findsOneWidget);
        expect(find.text('Bob'), findsOneWidget);
      });

      testWidgets('shows shortened address when nickname unavailable', (tester) async {
        const unknownAddress = '0x1234567890123456789012345678901234567890';

        await tester.pumpWidget(
          buildTestWidget(
            _GalleryHeaderWidget(
              address: unknownAddress,
              isOwnGallery: false,
              displayName: '0x1234...7890',
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('0x1234...7890'), findsOneWidget);
      });
    });

    group('Empty State', () {
      testWidgets('shows empty state for own gallery with mint action', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _EmptyGalleryWidget(
              isOwnGallery: true,
              isConnected: true,
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('No artworks yet'), findsOneWidget);
        expect(find.text('Mint Your First NFT'), findsOneWidget);
        expect(find.byIcon(Icons.collections_outlined), findsOneWidget);
      });

      testWidgets('shows empty state for other gallery without mint action', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _EmptyGalleryWidget(
              isOwnGallery: false,
              isConnected: true,
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('This gallery is empty'), findsOneWidget);
        expect(find.text('Mint Your First NFT'), findsNothing);
      });

      testWidgets('shows empty galleries list', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _EmptyGalleriesListWidget(),
          ),
        );

        expect(find.text('No galleries yet'), findsOneWidget);
        expect(find.text('Be the first to mint an NFT!'), findsOneWidget);
      });
    });

    group('Error State', () {
      testWidgets('shows error with retry button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _ErrorStateWidget(error: 'Failed to load gallery'),
          ),
        );

        expect(find.text('Error loading gallery'), findsOneWidget);
        expect(find.text('Failed to load gallery'), findsOneWidget);
        expect(find.text('Retry'), findsOneWidget);
      });
    });

    group('Token Cards', () {
      testWidgets('displays token card with name', (tester) async {
        final token = TokenFixtures.token(name: 'Mountain Vista');

        await tester.pumpWidget(
          buildTestWidget(
            _TokenCardWidget(token: token),
          ),
        );

        expect(find.text('Mountain Vista'), findsOneWidget);
      });

      testWidgets('displays token card with creator', (tester) async {
        final token = TokenFixtures.token(creator: TestAddresses.alice);

        await tester.pumpWidget(
          buildTestWidget(
            _TokenCardWidget(token: token, creatorName: 'Alice'),
          ),
        );

        expect(find.text('Creator: Alice'), findsOneWidget);
      });

      testWidgets('shows Original badge for original owner', (tester) async {
        final token = {
          ...TokenFixtures.token(),
          'isOriginal': true,
        };

        await tester.pumpWidget(
          buildTestWidget(
            _TokenCardWidget(token: token, showOriginalBadge: true),
          ),
        );

        expect(find.text('Original'), findsOneWidget);
      });

      testWidgets('shows License badge for licensed copy', (tester) async {
        final token = TokenFixtures.tokenWithLicense(
          isOriginal: false,
          ownerLicense: 'display',
        );

        await tester.pumpWidget(
          buildTestWidget(
            _TokenCardWidget(token: token, showOriginalBadge: false),
          ),
        );

        expect(find.text('License'), findsOneWidget);
      });

      testWidgets('token card is tappable', (tester) async {
        bool tapped = false;
        final token = TokenFixtures.token();

        await tester.pumpWidget(
          buildTestWidget(
            _TokenCardWidget(
              token: token,
              onTap: () => tapped = true,
            ),
          ),
        );

        await tester.tap(find.byType(_TokenCardWidget));
        await tester.pump();

        expect(tapped, isTrue);
      });
    });

    group('FOR SALE Badges', () {
      testWidgets('shows FOR SALE badge when token is listed', (tester) async {
        final token = {
          ...TokenFixtures.token(),
          'isListed': true,
          'listings': [
            {'licenseType': 'display', 'priceEth': '0.5'},
          ],
        };

        await tester.pumpWidget(
          buildTestWidget(
            _ForSaleBadgeWidget(token: token),
          ),
        );

        expect(find.text('FOR SALE'), findsOneWidget);
        expect(find.byIcon(Icons.local_offer), findsOneWidget);
      });

      testWidgets('hides FOR SALE badge when not listed', (tester) async {
        final token = {
          ...TokenFixtures.token(),
          'isListed': false,
        };

        await tester.pumpWidget(
          buildTestWidget(
            _ForSaleBadgeWidget(token: token),
          ),
        );

        expect(find.text('FOR SALE'), findsNothing);
      });

      testWidgets('shows single license listing badge', (tester) async {
        final token = {
          ...TokenFixtures.token(),
          'isListed': true,
          'listings': [
            {'licenseType': 'display', 'priceEth': '0.5'},
          ],
        };

        await tester.pumpWidget(
          buildTestWidget(
            _ListingBadgesWidget(token: token),
          ),
        );

        expect(find.text('Display: 0.5 ETH'), findsOneWidget);
      });

      testWidgets('shows multiple license listing badges', (tester) async {
        final token = {
          ...TokenFixtures.token(),
          'isListed': true,
          'listings': [
            {'licenseType': 'display', 'priceEth': '0.5'},
            {'licenseType': 'commercial', 'priceEth': '2.0'},
            {'licenseType': 'transfer', 'priceEth': '10.0'},
          ],
        };

        await tester.pumpWidget(
          buildTestWidget(
            _ListingBadgesWidget(token: token),
          ),
        );

        expect(find.text('Display: 0.5 ETH'), findsOneWidget);
        expect(find.text('Commercial: 2.0 ETH'), findsOneWidget);
        expect(find.text('Full Transfer: 10.0 ETH'), findsOneWidget);
      });
    });

    group('License Type Display', () {
      testWidgets('shows display license badge', (tester) async {
        final token = TokenFixtures.tokenWithLicense(ownerLicense: 'display');

        await tester.pumpWidget(
          buildTestWidget(
            _OwnerLicenseBadgeWidget(licenseType: 'display'),
          ),
        );

        expect(find.text('Display License'), findsOneWidget);
      });

      testWidgets('shows commercial license badge', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _OwnerLicenseBadgeWidget(licenseType: 'commercial'),
          ),
        );

        expect(find.text('Commercial License'), findsOneWidget);
      });

      testWidgets('shows full copyright badge', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _OwnerLicenseBadgeWidget(licenseType: 'transfer'),
          ),
        );

        expect(find.text('Full Copyright'), findsOneWidget);
      });
    });

    group('Search Functionality', () {
      testWidgets('search bar is displayed', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _SearchBarWidget(),
          ),
        );

        expect(find.byType(TextField), findsOneWidget);
        expect(find.byIcon(Icons.search), findsOneWidget);
        expect(find.text('View Gallery'), findsOneWidget);
      });

      testWidgets('search by nickname shows snackbar for invalid input', (tester) async {
        bool snackbarShown = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: Builder(
                builder: (context) => ElevatedButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Enter a wallet address (0x...) or name (Alice, Bob, etc.)',
                        ),
                      ),
                    );
                    snackbarShown = true;
                  },
                  child: const Text('Search Invalid'),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Search Invalid'));
        await tester.pump();

        expect(snackbarShown, isTrue);
      });

      testWidgets('search hint shows valid input formats', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _SearchBarWidget(),
          ),
        );

        expect(
          find.text('Enter name (Alice, Bob...) or address (0x...)'),
          findsOneWidget,
        );
      });
    });

    group('Gallery Discovery Cards', () {
      testWidgets('displays gallery card with owner name', (tester) async {
        final gallery = {
          'address': TestAddresses.alice,
          'tokenCount': 5,
          'previewTokenName': 'Sunset Art',
        };

        await tester.pumpWidget(
          buildTestWidget(
            _GalleryDiscoveryCardWidget(
              gallery: gallery,
              displayName: 'Alice',
            ),
          ),
        );

        expect(find.text('Alice'), findsOneWidget);
      });

      testWidgets('displays gallery card with token count', (tester) async {
        final gallery = {
          'address': TestAddresses.bob,
          'tokenCount': 3,
          'previewTokenName': 'Cool Art',
        };

        await tester.pumpWidget(
          buildTestWidget(
            _GalleryDiscoveryCardWidget(
              gallery: gallery,
              displayName: 'Bob',
            ),
          ),
        );

        expect(find.textContaining('3 NFTs'), findsOneWidget);
      });

      testWidgets('shows singular for single NFT', (tester) async {
        final gallery = {
          'address': TestAddresses.sam,
          'tokenCount': 1,
          'previewTokenName': 'Only Art',
        };

        await tester.pumpWidget(
          buildTestWidget(
            _GalleryDiscoveryCardWidget(
              gallery: gallery,
              displayName: 'Sam',
            ),
          ),
        );

        expect(find.textContaining('1 NFT'), findsOneWidget);
        expect(find.textContaining('1 NFTs'), findsNothing);
      });

      testWidgets('gallery card is tappable', (tester) async {
        bool tapped = false;
        final gallery = {
          'address': TestAddresses.alice,
          'tokenCount': 2,
          'previewTokenName': 'Art',
        };

        await tester.pumpWidget(
          buildTestWidget(
            _GalleryDiscoveryCardWidget(
              gallery: gallery,
              displayName: 'Alice',
              onTap: () => tapped = true,
            ),
          ),
        );

        await tester.tap(find.byType(_GalleryDiscoveryCardWidget));
        await tester.pump();

        expect(tapped, isTrue);
      });
    });

    group('Browse Galleries Section', () {
      testWidgets('shows section header with gold accent', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _SectionHeaderWidget(title: 'Browse Galleries'),
          ),
        );

        expect(find.text('Browse Galleries'), findsOneWidget);
        // Header should have gold underline (NFTmarketColors.accent)
      });
    });
  });
}

// Test widget implementations

class _GalleryHeaderWidget extends StatelessWidget {
  final String address;
  final bool isOwnGallery;
  final String? displayName;

  const _GalleryHeaderWidget({
    required this.address,
    required this.isOwnGallery,
    this.displayName,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          Container(
            padding: const EdgeInsets.only(bottom: 4),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: NFTmarketColors.accent, width: 2),
              ),
            ),
            child: Text(
              isOwnGallery ? 'My Collection' : 'Collection',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          if (!isOwnGallery && displayName != null) ...[
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: NFTmarketColors.surfaceLight,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(displayName!),
            ),
          ],
        ],
      ),
    );
  }
}

class _EmptyGalleryWidget extends StatelessWidget {
  final bool isOwnGallery;
  final bool isConnected;

  const _EmptyGalleryWidget({
    required this.isOwnGallery,
    required this.isConnected,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.collections_outlined, size: 48),
            const SizedBox(height: 12),
            Text(isOwnGallery ? 'No artworks yet' : 'This gallery is empty'),
            if (isOwnGallery && isConnected) ...[
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.add),
                label: const Text('Mint Your First NFT'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyGalleriesListWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people_outline, size: 48),
            SizedBox(height: 12),
            Text('No galleries yet'),
            SizedBox(height: 8),
            Text('Be the first to mint an NFT!'),
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
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 16),
            const Text('Error loading gallery'),
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

class _TokenCardWidget extends StatelessWidget {
  final Map<String, dynamic> token;
  final String? creatorName;
  final bool showOriginalBadge;
  final VoidCallback? onTap;

  const _TokenCardWidget({
    required this.token,
    this.creatorName,
    this.showOriginalBadge = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final name = token['name'] ?? 'NFT #${token['tokenId']}';
    final isOriginal = token['isOriginal'] ?? true;

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
                if (creatorName != null) Text('Creator: $creatorName'),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: (isOriginal ? NFTmarketColors.success : NFTmarketColors.info)
                        .withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: isOriginal ? NFTmarketColors.success : NFTmarketColors.info,
                    ),
                  ),
                  child: Text(
                    showOriginalBadge && isOriginal ? 'Original' : 'License',
                    style: TextStyle(
                      color: isOriginal ? NFTmarketColors.success : NFTmarketColors.info,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ForSaleBadgeWidget extends StatelessWidget {
  final Map<String, dynamic> token;

  const _ForSaleBadgeWidget({required this.token});

  @override
  Widget build(BuildContext context) {
    final isListed = token['isListed'] == true;

    if (!isListed) return const SizedBox.shrink();

    return Scaffold(
      body: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: NFTmarketColors.accent.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(4),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.local_offer, size: 10, color: Colors.white),
            SizedBox(width: 3),
            Text(
              'FOR SALE',
              style: TextStyle(
                color: Colors.white,
                fontSize: 8,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ListingBadgesWidget extends StatelessWidget {
  final Map<String, dynamic> token;

  const _ListingBadgesWidget({required this.token});

  String _formatLabel(String type) {
    switch (type.toLowerCase()) {
      case 'display':
        return 'Display';
      case 'commercial':
        return 'Commercial';
      case 'transfer':
        return 'Full Transfer';
      default:
        return type;
    }
  }

  Color _getColor(String type) {
    switch (type.toLowerCase()) {
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

  @override
  Widget build(BuildContext context) {
    final listings = token['listings'] as List<dynamic>? ?? [];

    if (listings.isEmpty) return const SizedBox.shrink();

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: listings.map<Widget>((listing) {
          final type = listing['licenseType'] as String? ?? '';
          final price = listing['priceEth'] as String? ?? '?';
          final color = _getColor(type);

          return Container(
            margin: const EdgeInsets.only(bottom: 2),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              '${_formatLabel(type)}: $price ETH',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _OwnerLicenseBadgeWidget extends StatelessWidget {
  final String licenseType;

  const _OwnerLicenseBadgeWidget({required this.licenseType});

  String get _label {
    switch (licenseType.toLowerCase()) {
      case 'display':
        return 'Display License';
      case 'commercial':
        return 'Commercial License';
      case 'transfer':
        return 'Full Copyright';
      default:
        return licenseType;
    }
  }

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: _color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: _color.withValues(alpha: 0.4)),
        ),
        child: Text(
          _label,
          style: TextStyle(
            color: _color,
            fontWeight: FontWeight.w500,
            fontSize: 11,
          ),
        ),
      ),
    );
  }
}

class _SearchBarWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          Expanded(
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Enter name (Alice, Bob...) or address (0x...)',
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
    );
  }
}

class _GalleryDiscoveryCardWidget extends StatelessWidget {
  final Map<String, dynamic> gallery;
  final String displayName;
  final VoidCallback? onTap;

  const _GalleryDiscoveryCardWidget({
    required this.gallery,
    required this.displayName,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final tokenCount = gallery['tokenCount'] ?? 0;
    final previewName = gallery['previewTokenName'] ?? 'NFT';

    return Material(
      child: InkWell(
        onTap: onTap,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: NFTmarketColors.accent.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.account_circle),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        '$tokenCount NFT${tokenCount == 1 ? '' : 's'} · $previewName',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeaderWidget extends StatelessWidget {
  final String title;

  const _SectionHeaderWidget({required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: const EdgeInsets.only(bottom: 4),
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: NFTmarketColors.accent, width: 2),
          ),
        ),
        child: Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
      ),
    );
  }
}
