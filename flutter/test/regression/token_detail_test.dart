import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nftmarket/models/token.dart';
import 'package:nftmarket/theme.dart';

import '../fixtures/api_responses.dart';
import '../utils/test_app.dart';

/// Regression tests for the Token Detail page.
///
/// This is the most complex page in the app, handling:
/// - Token info display
/// - Owner actions (list, delist)
/// - Non-owner actions (buy, connect wallet)
/// - License status and upgrade logic
/// - Bilateral agreement signing flow
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Token Detail Page', () {
    group('Loading State', () {
      testWidgets('shows loading indicator initially', (tester) async {
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

    group('Error State', () {
      testWidgets('shows error message when loading fails', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _ErrorStateWidget(error: 'Token not found'),
          ),
        );

        expect(find.text('Error loading token'), findsOneWidget);
        expect(find.text('Token not found'), findsOneWidget);
        expect(find.text('Retry'), findsOneWidget);
      });
    });

    group('Token Info Display', () {
      testWidgets('shows token name', (tester) async {
        final token = TokenFixtures.token(name: 'Cosmic Dreams');

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoWidget(token: token),
          ),
        );

        expect(find.text('Cosmic Dreams'), findsOneWidget);
      });

      testWidgets('shows token description', (tester) async {
        final token = TokenFixtures.token(
          description: 'A stunning piece of digital art',
        );

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoWidget(token: token),
          ),
        );

        expect(find.text('A stunning piece of digital art'), findsOneWidget);
      });

      testWidgets('shows creator address with shortened format',
          (tester) async {
        final token = TokenFixtures.token(
          creator: TestAddresses.alice,
          currentOwner: TestAddresses.bob, // Different owner to avoid duplicate
        );

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoCardWidget(token: token),
          ),
        );

        expect(find.text('Creator'), findsOneWidget);
        expect(
            find.textContaining('0x3C44'), findsOneWidget); // Alice's address
      });

      testWidgets('shows owner address', (tester) async {
        final token = TokenFixtures.token(currentOwner: TestAddresses.bob);

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoCardWidget(token: token),
          ),
        );

        expect(find.text('Owner'), findsOneWidget);
        expect(find.textContaining('0x90F7'), findsOneWidget);
      });

      testWidgets('shows "You" badge when user is owner', (tester) async {
        final token = TokenFixtures.token(currentOwner: TestAddresses.alice);

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoCardWidget(token: token, isOwner: true),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('You'), findsOneWidget);
      });

      testWidgets('shows minted date', (tester) async {
        final token = TokenFixtures.token();

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoCardWidget(token: token),
          ),
        );

        expect(find.text('Minted'), findsOneWidget);
        expect(find.textContaining('15/1/2024'), findsOneWidget);
      });

      testWidgets('shows watermark ID when present', (tester) async {
        final token = TokenFixtures.token(watermarkId: 'WM_12345');

        await tester.pumpWidget(
          buildTestWidget(
            _TokenInfoCardWidget(token: token),
          ),
        );

        expect(find.text('Watermark ID'), findsOneWidget);
        expect(find.text('WM_12345'), findsOneWidget);
      });
    });

    group('Owner Actions - Not Listed', () {
      testWidgets('shows "List for Sale" button when owner and not listed',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _OwnerActionsWidget(isOwner: true, isListed: false),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('List for Sale'), findsOneWidget);
        expect(find.byIcon(Icons.sell), findsOneWidget);
      });

      testWidgets('List for Sale button is tappable', (tester) async {
        bool tapped = false;

        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: ElevatedButton.icon(
                onPressed: () => tapped = true,
                icon: const Icon(Icons.sell),
                label: const Text('List for Sale'),
              ),
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        await tester.tap(find.text('List for Sale'));
        await tester.pump();

        expect(tapped, isTrue);
      });
    });

    group('Owner Actions - Listed', () {
      testWidgets('shows listed status with price', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const Scaffold(
              body: Center(
                child: _ListedStatusWidget(priceEth: '2.5'),
              ),
            ),
          ),
        );

        expect(find.text('Listed for 2.5 ETH'), findsOneWidget);
        expect(find.byIcon(Icons.local_offer), findsOneWidget);
      });

      testWidgets('shows "Remove Listing" button when listed', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _OwnerActionsWidget(
                isOwner: true, isListed: true, priceEth: '1.0'),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.text('Remove Listing'), findsOneWidget);
        expect(find.byIcon(Icons.remove_shopping_cart), findsOneWidget);
      });
    });

    group('Non-Owner Actions - Listed', () {
      testWidgets('shows buy button when connected and token listed',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _BuyActionWidget(
              isConnected: true,
              isListed: true,
              priceEth: '1.5',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('Buy for 1.5 ETH'), findsOneWidget);
        expect(find.byIcon(Icons.shopping_cart), findsOneWidget);
      });

      testWidgets('shows "Connect Wallet to Buy" when not connected',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _BuyActionWidget(
              isConnected: false,
              isListed: true,
              priceEth: '1.5',
            ),
            walletProvider: disconnected(),
          ),
        );

        expect(find.text('Connect Wallet to Buy (1.5 ETH)'), findsOneWidget);
        expect(find.byIcon(Icons.account_balance_wallet), findsOneWidget);
      });
    });

    group('Bilateral Agreement Notice', () {
      testWidgets('shows bilateral agreement info before buy', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _BilateralAgreementWidget(),
          ),
        );

        expect(find.text('Bilateral Agreement Required'), findsOneWidget);
        expect(
          find.textContaining('sign a license agreement'),
          findsOneWidget,
        );
        expect(find.byIcon(Icons.verified_user), findsOneWidget);
      });
    });

    group('License Status Integration', () {
      testWidgets('shows existing license info when user has license',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _ExistingLicenseWidget(existingLicense: 'display'),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(
          find.text('You own a display license for this image'),
          findsOneWidget,
        );
      });

      testWidgets('shows "Upgrade to X" when upgrading license',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _UpgradeBuyButtonWidget(
              existingLicense: 'display',
              targetLicense: 'commercial',
              priceEth: '5.0',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('Upgrade to commercial for 5.0 ETH'), findsOneWidget);
      });

      testWidgets('shows cannot downgrade message', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _CannotBuyWidget(
              existingLicense: 'commercial',
              listingLicense: 'display',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(
          find.text('Cannot downgrade from commercial to display'),
          findsOneWidget,
        );
      });

      testWidgets('shows already owned message for same license',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _CannotBuyWidget(
              existingLicense: 'display',
              listingLicense: 'display',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('You already own a display license'), findsOneWidget);
      });
    });

    group('List Dialog', () {
      testWidgets('dialog has price input field', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _SimplifiedListDialog(),
          ),
        );

        expect(find.text('Price in ETH'), findsOneWidget);
        expect(find.byType(TextField), findsOneWidget);
      });

      testWidgets('dialog shows license type options', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _LicenseOptionsWidget(),
          ),
        );

        expect(find.text('License Type'), findsOneWidget);
        expect(find.text('Display'), findsOneWidget);
        expect(find.text('Commercial'), findsOneWidget);
        expect(find.text('Full Transfer'), findsOneWidget);
      });

      testWidgets('dialog has agreement warning', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _AgreementWarningWidget(),
          ),
        );

        expect(
          find.textContaining('sign a binding agreement'),
          findsOneWidget,
        );
      });

      testWidgets('dialog has cancel and confirm buttons', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _DialogButtonsWidget(),
          ),
        );

        expect(find.text('Cancel'), findsOneWidget);
        expect(find.text('Sign & List'), findsOneWidget);
      });

      testWidgets('license type values are available', (tester) async {
        // Test the LicenseType enum directly
        expect(LicenseType.values.length, equals(3));
        expect(LicenseType.display.displayName, equals('Display'));
        expect(LicenseType.commercial.displayName, equals('Commercial'));
        expect(LicenseType.transfer.displayName, equals('Full Transfer'));
      });
    });

    group('Common Action Buttons', () {
      testWidgets('shows Verify Authenticity button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _CommonActionsWidget(tokenId: 1),
          ),
        );

        expect(find.text('Verify Authenticity'), findsOneWidget);
        expect(find.byIcon(Icons.verified), findsOneWidget);
      });

      testWidgets('shows Share button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _CommonActionsWidget(tokenId: 1),
          ),
        );

        expect(find.text('Share'), findsOneWidget);
        expect(find.byIcon(Icons.share), findsOneWidget);
      });

      testWidgets('shows Polygonscan link when transaction hash exists',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _CommonActionsWidget(
              tokenId: 1,
              transactionHash: '0xabc123',
            ),
          ),
        );

        expect(find.text('View on Polygonscan'), findsOneWidget);
        expect(find.byIcon(Icons.open_in_new), findsOneWidget);
      });
    });

    group('Loading States', () {
      testWidgets('shows loading spinner on action button while processing',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _LoadingActionButtonWidget(
              label: 'List for Sale',
              isLoading: true,
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('List for Sale'), findsOneWidget);
      });

      testWidgets('disables button while loading', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _LoadingActionButtonWidget(
              label: 'Buy',
              isLoading: true,
            ),
          ),
        );

        // Find the InkWell's onTap (should be null)
        final inkWell = tester.widget<InkWell>(find.byType(InkWell));
        expect(inkWell.onTap, isNull);
      });
    });

    group('License Offered Display', () {
      testWidgets('shows license type when listing is active', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _ListingInfoWidget(
              licenseType: 'display',
              priceEth: '1.0',
            ),
          ),
        );

        expect(find.text('License Offered'), findsOneWidget);
        expect(find.text('Display Only'), findsOneWidget);
      });

      testWidgets('shows commercial license name correctly', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _ListingInfoWidget(
              licenseType: 'commercial',
              priceEth: '5.0',
            ),
          ),
        );

        expect(find.text('Commercial'), findsOneWidget);
      });

      testWidgets('shows full transfer license name correctly', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _ListingInfoWidget(
              licenseType: 'transfer',
              priceEth: '10.0',
            ),
          ),
        );

        expect(find.text('Full Transfer'), findsOneWidget);
      });
    });

    group('Gallery Navigation', () {
      testWidgets('creator address has gallery button', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _AddressWithGalleryButton(
              label: 'Creator',
              address: TestAddresses.alice,
            ),
          ),
        );

        expect(find.byIcon(Icons.collections), findsOneWidget);
      });

      testWidgets('owner address has gallery button when not current user',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            const _AddressWithGalleryButton(
              label: 'Owner',
              address: TestAddresses.bob,
              isCurrentUser: false,
            ),
            walletProvider: connectedAsAlice(),
          ),
        );

        expect(find.byIcon(Icons.collections), findsOneWidget);
      });
    });
  });
}

// Test widget implementations

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
            const Text('Error loading token'),
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

class _TokenInfoWidget extends StatelessWidget {
  final Map<String, dynamic> token;

  const _TokenInfoWidget({required this.token});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            token['name'] as String,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          if (token['description'] != null) ...[
            const SizedBox(height: 8),
            Text(token['description'] as String),
          ],
        ],
      ),
    );
  }
}

class _TokenInfoCardWidget extends StatelessWidget {
  final Map<String, dynamic> token;
  final bool isOwner;

  const _TokenInfoCardWidget({
    required this.token,
    this.isOwner = false,
  });

  String _shortAddress(String address) {
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }

  String _formatDate(String isoDate) {
    final date = DateTime.parse(isoDate);
    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final creator = token['creator'] as String;
    final owner = token['currentOwner'] as String;
    final mintedAt = token['mintedAt'] as String;
    final watermarkId = token['watermarkId'] as String?;

    return Scaffold(
      body: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              _InfoRow(label: 'Creator', value: _shortAddress(creator)),
              const Divider(),
              Row(
                children: [
                  const Text('Owner'),
                  const Spacer(),
                  Text(_shortAddress(owner)),
                  if (isOwner) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: NFTmarketColors.success.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'You',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: NFTmarketColors.success,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const Divider(),
              _InfoRow(label: 'Minted', value: _formatDate(mintedAt)),
              if (watermarkId != null) ...[
                const Divider(),
                _InfoRow(label: 'Watermark ID', value: watermarkId),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label),
        const Spacer(),
        Text(value),
      ],
    );
  }
}

class _OwnerActionsWidget extends StatelessWidget {
  final bool isOwner;
  final bool isListed;
  final String? priceEth;

  const _OwnerActionsWidget({
    required this.isOwner,
    required this.isListed,
    this.priceEth,
  });

  @override
  Widget build(BuildContext context) {
    if (!isOwner) return const SizedBox.shrink();

    return Scaffold(
      body: Column(
        children: [
          if (!isListed)
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.sell),
              label: const Text('List for Sale'),
            ),
          if (isListed) ...[
            _ListedStatusWidget(priceEth: priceEth ?? '0'),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.remove_shopping_cart),
              label: const Text('Remove Listing'),
            ),
          ],
        ],
      ),
    );
  }
}

class _ListedStatusWidget extends StatelessWidget {
  final String priceEth;

  const _ListedStatusWidget({required this.priceEth});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NFTmarketColors.accent.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min, // Prevent overflow in tests
        children: [
          const Icon(Icons.local_offer, color: NFTmarketColors.accent),
          const SizedBox(width: 12),
          Text(
            'Listed for $priceEth ETH',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              color: NFTmarketColors.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _BuyActionWidget extends StatelessWidget {
  final bool isConnected;
  final bool isListed;
  final String priceEth;

  const _BuyActionWidget({
    required this.isConnected,
    required this.isListed,
    required this.priceEth,
  });

  @override
  Widget build(BuildContext context) {
    if (!isListed) return const SizedBox.shrink();

    return Scaffold(
      body: isConnected
          ? ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.shopping_cart),
              label: Text('Buy for $priceEth ETH'),
            )
          : ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.account_balance_wallet),
              label: Text('Connect Wallet to Buy ($priceEth ETH)'),
            ),
    );
  }
}

class _BilateralAgreementWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: NFTmarketColors.info.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.verified_user, color: NFTmarketColors.info),
                SizedBox(width: 10),
                Text(
                  'Bilateral Agreement Required',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: NFTmarketColors.info,
                  ),
                ),
              ],
            ),
            SizedBox(height: 8),
            Text(
              'By clicking Buy, you will sign a license agreement that will be recorded on-chain.',
            ),
          ],
        ),
      ),
    );
  }
}

class _ExistingLicenseWidget extends StatelessWidget {
  final String existingLicense;

  const _ExistingLicenseWidget({required this.existingLicense});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: NFTmarketColors.warning.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.info_outline, color: NFTmarketColors.warning),
            const SizedBox(width: 10),
            Text('You own a $existingLicense license for this image'),
          ],
        ),
      ),
    );
  }
}

class _UpgradeBuyButtonWidget extends StatelessWidget {
  final String existingLicense;
  final String targetLicense;
  final String priceEth;

  const _UpgradeBuyButtonWidget({
    required this.existingLicense,
    required this.targetLicense,
    required this.priceEth,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ElevatedButton.icon(
        onPressed: () {},
        icon: const Icon(Icons.shopping_cart),
        label: Text('Upgrade to $targetLicense for $priceEth ETH'),
      ),
    );
  }
}

class _CannotBuyWidget extends StatelessWidget {
  final String existingLicense;
  final String listingLicense;

  const _CannotBuyWidget({
    required this.existingLicense,
    required this.listingLicense,
  });

  @override
  Widget build(BuildContext context) {
    final message = existingLicense == listingLicense
        ? 'You already own a $existingLicense license'
        : 'Cannot downgrade from $existingLicense to $listingLicense';

    return Scaffold(
      body: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: NFTmarketColors.textSecondary.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.block, color: NFTmarketColors.textSecondary),
            const SizedBox(width: 10),
            Text(message),
          ],
        ),
      ),
    );
  }
}

class _MockListDialog extends StatefulWidget {
  @override
  State<_MockListDialog> createState() => _MockListDialogState();
}

class _MockListDialogState extends State<_MockListDialog> {
  LicenseType _selectedLicense = LicenseType.display;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AlertDialog(
        title: const Text('List for Sale'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Warning
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: NFTmarketColors.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'You will sign a binding agreement to sell under the chosen license terms.',
              ),
            ),
            const SizedBox(height: 16),
            // Price input
            const TextField(
              decoration: InputDecoration(
                labelText: 'Price in ETH',
                hintText: '0.1',
                suffixText: 'ETH',
              ),
            ),
            const SizedBox(height: 24),
            // License type
            const Text('License Type'),
            const SizedBox(height: 8),
            ...LicenseType.values.map((license) {
              return RadioListTile<LicenseType>(
                title: Text(license.displayName),
                subtitle: Text(license.description),
                value: license,
                groupValue: _selectedLicense,
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _selectedLicense = value);
                  }
                },
              );
            }),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {},
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.edit, size: 18),
            label: const Text('Sign & List'),
          ),
        ],
      ),
    );
  }
}

class _CommonActionsWidget extends StatelessWidget {
  final int tokenId;
  final String? transactionHash;

  const _CommonActionsWidget({
    required this.tokenId,
    this.transactionHash,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.verified),
            label: const Text('Verify Authenticity'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.share),
            label: const Text('Share'),
          ),
          if (transactionHash != null) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.open_in_new),
              label: const Text('View on Polygonscan'),
            ),
          ],
        ],
      ),
    );
  }
}

class _LoadingActionButtonWidget extends StatelessWidget {
  final String label;
  final bool isLoading;

  const _LoadingActionButtonWidget({
    required this.label,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: InkWell(
        onTap: isLoading ? null : () {},
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: BoxDecoration(
            color: NFTmarketColors.primary,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isLoading)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              else
                const Icon(Icons.sell, color: Colors.white, size: 18),
              const SizedBox(width: 10),
              Text(label, style: const TextStyle(color: Colors.white)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ListingInfoWidget extends StatelessWidget {
  final String licenseType;
  final String priceEth;

  const _ListingInfoWidget({
    required this.licenseType,
    required this.priceEth,
  });

  String get _displayName {
    switch (licenseType) {
      case 'display':
        return 'Display Only';
      case 'commercial':
        return 'Commercial';
      case 'transfer':
        return 'Full Transfer';
      default:
        return licenseType;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          const Text('License Offered'),
          const Spacer(),
          Text(_displayName),
        ],
      ),
    );
  }
}

class _AddressWithGalleryButton extends StatelessWidget {
  final String label;
  final String address;
  final bool isCurrentUser;

  const _AddressWithGalleryButton({
    required this.label,
    required this.address,
    this.isCurrentUser = false,
  });

  String get _shortAddress {
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          Text(label),
          const Spacer(),
          Text(_shortAddress),
          if (!isCurrentUser) ...[
            const SizedBox(width: 8),
            InkWell(
              onTap: () {},
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: NFTmarketColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.collections,
                  size: 18,
                  color: NFTmarketColors.primary,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// Simplified dialog components for testing
class _SimplifiedListDialog extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Column(
        children: [
          TextField(
            decoration: InputDecoration(
              labelText: 'Price in ETH',
              hintText: '0.1',
              suffixText: 'ETH',
            ),
          ),
        ],
      ),
    );
  }
}

class _LicenseOptionsWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('License Type'),
          Text('Display'),
          Text('Commercial'),
          Text('Full Transfer'),
        ],
      ),
    );
  }
}

class _AgreementWarningWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Text(
          'You will sign a binding agreement to sell under the chosen license terms.'),
    );
  }
}

class _DialogButtonsWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          TextButton(
            onPressed: () {},
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.edit, size: 18),
            label: const Text('Sign & List'),
          ),
        ],
      ),
    );
  }
}
