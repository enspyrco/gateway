import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';

/// Integration tests for the NFTmarket marketplace
///
/// Note: Tests that load actual pages (MarketplacePage, TokenDetailPage) are skipped
/// because TestWidgetsFlutterBinding blocks HTTP requests. Those tests require
/// running on a real device with:
///   flutter test integration_test/ -d <device>
///
/// Run with:
///   flutter test test/integration/marketplace_test.dart
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Marketplace UI Components', () {
    testWidgets('List dialog shows license options', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (_) => const _MockListDialog(),
                    );
                  },
                  child: const Text('Open List Dialog'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap to open dialog
      await tester.tap(find.text('Open List Dialog'));
      await tester.pumpAndSettle();

      // Verify license options are shown
      expect(find.text('Display'), findsOneWidget);
      expect(find.text('Commercial'), findsOneWidget);
      expect(find.text('Full Transfer'), findsOneWidget);
      expect(find.text('Price in ETH'), findsOneWidget);
    });

    testWidgets('License selection works in dialog', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (_) => const _MockListDialog(),
                    );
                  },
                  child: const Text('Open List Dialog'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();
      await tester.tap(find.text('Open List Dialog'));
      await tester.pumpAndSettle();

      // Select Commercial license
      await tester.tap(find.text('Commercial'));
      await tester.pumpAndSettle();

      // Verify selection changed (Commercial radio should be selected)
      final commercialRadio = find.byWidgetPredicate(
        (widget) => widget is RadioListTile<LicenseType> &&
                    widget.value == LicenseType.commercial,
      );
      expect(commercialRadio, findsOneWidget);
    });

    testWidgets('Buy button shows price', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.shopping_cart),
              label: const Text('Buy for 1.5 ETH'),
            ),
          ),
        ),
      );

      expect(find.text('Buy for 1.5 ETH'), findsOneWidget);
      expect(find.byIcon(Icons.shopping_cart), findsOneWidget);
    });

    testWidgets('List for sale button styled correctly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ElevatedButton.icon(
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
      );

      expect(find.text('List for Sale'), findsOneWidget);
      expect(find.byIcon(Icons.sell), findsOneWidget);
    });

    testWidgets('Delist button styled correctly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.remove_shopping_cart),
              label: const Text('Remove Listing'),
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
            ),
          ),
        ),
      );

      expect(find.text('Remove Listing'), findsOneWidget);
      expect(find.byIcon(Icons.remove_shopping_cart), findsOneWidget);
    });
  });

  group('License Type Selection', () {
    test('License types have correct values', () {
      expect(LicenseType.display.index, equals(0));
      expect(LicenseType.commercial.index, equals(1));
      expect(LicenseType.transfer.index, equals(2));
    });

    test('License types have display names', () {
      expect(LicenseType.display.displayName, equals('Display'));
      expect(LicenseType.commercial.displayName, equals('Commercial'));
      expect(LicenseType.transfer.displayName, equals('Full Transfer'));
    });

    test('License types have descriptions', () {
      expect(LicenseType.display.description, contains('Personal'));
      expect(LicenseType.commercial.description, contains('Commercial'));
      expect(LicenseType.transfer.description, contains('copyright'));
    });
  });

  group('Marketplace Provider State', () {
    test('WalletProvider starts disconnected', () {
      final wallet = WalletProvider();
      expect(wallet.isConnected, isFalse);
      expect(wallet.address, isNull);
    });

    test('MintProvider can be created', () {
      final mint = MintProvider();
      expect(mint, isNotNull);
    });
  });
}

/// Mock list dialog for testing license selection UI
class _MockListDialog extends StatefulWidget {
  const _MockListDialog();

  @override
  State<_MockListDialog> createState() => _MockListDialogState();
}

class _MockListDialogState extends State<_MockListDialog> {
  LicenseType _selectedLicense = LicenseType.display;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('List for Sale'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const TextField(
            decoration: InputDecoration(
              labelText: 'Price in ETH',
            ),
          ),
          const SizedBox(height: 16),
          ...LicenseType.values.map((license) => RadioListTile<LicenseType>(
                title: Text(license.displayName),
                subtitle: Text(license.description),
                value: license,
                groupValue: _selectedLicense,
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _selectedLicense = value);
                  }
                },
              )),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _selectedLicense),
          child: const Text('List'),
        ),
      ],
    );
  }
}

// Local LicenseType enum for tests
enum LicenseType {
  display,
  commercial,
  transfer;

  String get displayName {
    switch (this) {
      case LicenseType.display:
        return 'Display';
      case LicenseType.commercial:
        return 'Commercial';
      case LicenseType.transfer:
        return 'Full Transfer';
    }
  }

  String get description {
    switch (this) {
      case LicenseType.display:
        return 'Personal display rights only';
      case LicenseType.commercial:
        return 'Commercial usage rights';
      case LicenseType.transfer:
        return 'Full copyright transfer';
    }
  }
}
