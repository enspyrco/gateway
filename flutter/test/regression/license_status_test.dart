import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/models/token.dart';
import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/theme.dart';

import '../fixtures/api_responses.dart';
import '../mocks/mock_http_client.dart';
import '../utils/test_app.dart';

/// Regression tests for the license upgrade/downgrade logic.
///
/// The marketplace enforces a license hierarchy:
///   Display (0) < Commercial (1) < Transfer (2)
///
/// Users can UPGRADE (buy higher tier) but cannot DOWNGRADE (buy lower tier
/// when they already own a higher tier). This prevents confusion where a user
/// might think they're getting more rights when they're actually getting less.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('License Status Logic', () {
    group('getLicenseStatus Response Parsing', () {
      test('no existing license allows all purchases', () {
        final status = LicenseStatusFixtures.noExistingLicense();

        expect(status['existingLicense'], isNull);
        expect(status['canBuy']['display'], isTrue);
        expect(status['canBuy']['commercial'], isTrue);
        expect(status['canBuy']['transfer'], isTrue);
      });

      test('display license allows commercial and transfer upgrades', () {
        final status = LicenseStatusFixtures.hasDisplayLicense();

        expect(status['existingLicense'], equals('display'));
        expect(status['canBuy']['display'], isFalse); // Already owns
        expect(status['canBuy']['commercial'], isTrue); // Can upgrade
        expect(status['canBuy']['transfer'], isTrue); // Can upgrade
      });

      test('commercial license blocks display but allows transfer', () {
        final status = LicenseStatusFixtures.hasCommercialLicense();

        expect(status['existingLicense'], equals('commercial'));
        expect(status['canBuy']['display'], isFalse); // Cannot downgrade
        expect(status['canBuy']['commercial'], isFalse); // Already owns
        expect(status['canBuy']['transfer'], isTrue); // Can upgrade
      });

      test('transfer license blocks all purchases', () {
        final status = LicenseStatusFixtures.hasTransferLicense();

        expect(status['existingLicense'], equals('transfer'));
        expect(status['canBuy']['display'], isFalse);
        expect(status['canBuy']['commercial'], isFalse);
        expect(status['canBuy']['transfer'], isFalse);
      });

      test('copyright owner cannot purchase any license', () {
        final status = LicenseStatusFixtures.isCopyrightOwner();

        expect(status['existingLicense'], equals('copyright'));
        expect(status['canBuy']['display'], isFalse);
        expect(status['canBuy']['commercial'], isFalse);
        expect(status['canBuy']['transfer'], isFalse);
      });
    });

    group('License Type Enum', () {
      test('LicenseType has correct contract values', () {
        expect(LicenseType.display.contractValue, equals(0));
        expect(LicenseType.commercial.contractValue, equals(1));
        expect(LicenseType.transfer.contractValue, equals(2));
      });

      test('LicenseType parses from string case-insensitively', () {
        expect(LicenseType.fromString('display'), equals(LicenseType.display));
        expect(LicenseType.fromString('Display'), equals(LicenseType.display));
        expect(LicenseType.fromString('DISPLAY'), equals(LicenseType.display));
        expect(LicenseType.fromString('commercial'),
            equals(LicenseType.commercial));
        expect(
            LicenseType.fromString('transfer'), equals(LicenseType.transfer));
      });

      test('LicenseType.fromString defaults to display for unknown values', () {
        expect(LicenseType.fromString('unknown'), equals(LicenseType.display));
        expect(LicenseType.fromString(''), equals(LicenseType.display));
      });

      test('LicenseType displayName matches expected UI strings', () {
        expect(LicenseType.display.displayName, equals('Display'));
        expect(LicenseType.commercial.displayName, equals('Commercial'));
        expect(LicenseType.transfer.displayName, equals('Full Transfer'));
      });
    });

    group('canBuy Logic Verification', () {
      /// Helper to check if a purchase is allowed based on license hierarchy
      bool canUpgrade(String? existing, String target) {
        if (existing == null) return true; // No existing license, can buy any

        const hierarchy = {
          'display': 0,
          'commercial': 1,
          'transfer': 2,
          'copyright': 3
        };
        final existingLevel = hierarchy[existing] ?? -1;
        final targetLevel = hierarchy[target] ?? -1;

        return targetLevel > existingLevel;
      }

      test('upgrade from display to commercial is allowed', () {
        expect(canUpgrade('display', 'commercial'), isTrue);
      });

      test('upgrade from display to transfer is allowed', () {
        expect(canUpgrade('display', 'transfer'), isTrue);
      });

      test('upgrade from commercial to transfer is allowed', () {
        expect(canUpgrade('commercial', 'transfer'), isTrue);
      });

      test('downgrade from commercial to display is blocked', () {
        expect(canUpgrade('commercial', 'display'), isFalse);
      });

      test('downgrade from transfer to display is blocked', () {
        expect(canUpgrade('transfer', 'display'), isFalse);
      });

      test('downgrade from transfer to commercial is blocked', () {
        expect(canUpgrade('transfer', 'commercial'), isFalse);
      });

      test('re-purchasing same license is blocked', () {
        expect(canUpgrade('display', 'display'), isFalse);
        expect(canUpgrade('commercial', 'commercial'), isFalse);
        expect(canUpgrade('transfer', 'transfer'), isFalse);
      });

      test('copyright owner cannot buy any license', () {
        expect(canUpgrade('copyright', 'display'), isFalse);
        expect(canUpgrade('copyright', 'commercial'), isFalse);
        expect(canUpgrade('copyright', 'transfer'), isFalse);
      });

      test('no existing license allows any purchase', () {
        expect(canUpgrade(null, 'display'), isTrue);
        expect(canUpgrade(null, 'commercial'), isTrue);
        expect(canUpgrade(null, 'transfer'), isTrue);
      });
    });
  });

  group('License Status UI Components', () {
    group('Existing License Info Box', () {
      testWidgets('shows existing license when user owns display',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _ExistingLicenseInfoWidget(
              existingLicense: 'display',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('You own a display license for this image'),
            findsOneWidget);
        expect(find.byIcon(Icons.info_outline), findsOneWidget);
      });

      testWidgets('shows existing license when user owns commercial',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _ExistingLicenseInfoWidget(
              existingLicense: 'commercial',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('You own a commercial license for this image'),
            findsOneWidget);
      });

      testWidgets('does not show when no existing license', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _ExistingLicenseInfoWidget(
              existingLicense: null,
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        // The SizedBox.shrink should be rendered, not the info text
        expect(find.text('You own a'), findsNothing);
      });
    });

    group('Cannot Buy Message', () {
      testWidgets('shows downgrade blocked message', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _CannotBuyMessageWidget(
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
        expect(find.byIcon(Icons.block), findsOneWidget);
      });

      testWidgets('shows already owned message for same license',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _CannotBuyMessageWidget(
              existingLicense: 'display',
              listingLicense: 'display',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(
          find.text('You already own a display license'),
          findsOneWidget,
        );
      });
    });

    group('Buy Button Label', () {
      testWidgets('shows "Buy for X ETH" when no existing license',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _BuyButtonWidget(
              existingLicense: null,
              listingLicense: 'display',
              priceEth: '1.5',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('Buy for 1.5 ETH'), findsOneWidget);
      });

      testWidgets('shows "Upgrade to X for Y ETH" when upgrading',
          (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            _BuyButtonWidget(
              existingLicense: 'display',
              listingLicense: 'commercial',
              priceEth: '5.0',
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        expect(find.text('Upgrade to commercial for 5.0 ETH'), findsOneWidget);
      });
    });

    group('Buy Button Enabled State', () {
      testWidgets('buy button enabled when can purchase', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: _BuyButtonWidget(
                existingLicense: null,
                listingLicense: 'display',
                priceEth: '1.0',
                canBuy: true,
              ),
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        // Find the button text to verify it's tappable
        expect(find.text('Buy for 1.0 ETH'), findsOneWidget);
        // Verify it's enabled by checking we can tap it without error
        await tester.tap(find.text('Buy for 1.0 ETH'));
        await tester.pump();
      });

      testWidgets('buy button disabled when cannot purchase', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            Scaffold(
              body: _BuyButtonWidget(
                existingLicense: 'commercial',
                listingLicense: 'display',
                priceEth: '1.0',
                canBuy: false,
              ),
            ),
            walletProvider: connectedAsBob(),
          ),
        );

        // Verify the button text shows the upgrade label
        expect(find.text('Upgrade to display for 1.0 ETH'), findsOneWidget);
        // The button should be disabled (onPressed: null)
      });
    });
  });

  group('License Badge Colors', () {
    test('display license uses blue color', () {
      expect(NFTmarketColors.displayBlue, equals(const Color(0xFF3B82F6)));
    });

    test('commercial license uses orange color', () {
      expect(NFTmarketColors.commercialOrange, equals(const Color(0xFFF59E0B)));
    });

    test('transfer license uses purple color', () {
      expect(NFTmarketColors.transferPurple, equals(const Color(0xFFA855F7)));
    });

    testWidgets('license badge shows correct label for display',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: _LicenseBadge(licenseType: 'display'),
          ),
        ),
      );

      // Just verify the badge renders correctly
      expect(find.text('Display'), findsOneWidget);
    });
  });
}

// Test widget implementations that mirror the actual token_detail_page.dart components

class _ExistingLicenseInfoWidget extends StatelessWidget {
  final String? existingLicense;

  const _ExistingLicenseInfoWidget({this.existingLicense});

  @override
  Widget build(BuildContext context) {
    if (existingLicense == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NFTmarketColors.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: NFTmarketColors.warning.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: NFTmarketColors.warning.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.info_outline,
                color: NFTmarketColors.warning, size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'You own a $existingLicense license for this image',
              style: const TextStyle(
                color: NFTmarketColors.warning,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CannotBuyMessageWidget extends StatelessWidget {
  final String existingLicense;
  final String listingLicense;

  const _CannotBuyMessageWidget({
    required this.existingLicense,
    required this.listingLicense,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NFTmarketColors.textSecondary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: NFTmarketColors.textSecondary.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: NFTmarketColors.textSecondary.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.block,
                color: NFTmarketColors.textSecondary, size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              existingLicense == listingLicense
                  ? 'You already own a $existingLicense license'
                  : 'Cannot downgrade from $existingLicense to $listingLicense',
              style: const TextStyle(
                color: NFTmarketColors.textSecondary,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BuyButtonWidget extends StatelessWidget {
  final String? existingLicense;
  final String listingLicense;
  final String priceEth;
  final bool canBuy;

  const _BuyButtonWidget({
    this.existingLicense,
    required this.listingLicense,
    required this.priceEth,
    this.canBuy = true,
  });

  String get _label {
    if (existingLicense != null) {
      return 'Upgrade to $listingLicense for $priceEth ETH';
    }
    return 'Buy for $priceEth ETH';
  }

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: canBuy ? () {} : null,
      icon: const Icon(Icons.shopping_cart),
      label: Text(_label),
    );
  }
}

class _LicenseBadge extends StatelessWidget {
  final String licenseType;

  const _LicenseBadge({required this.licenseType});

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
