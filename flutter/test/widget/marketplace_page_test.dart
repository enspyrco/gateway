// Charge 3.1 fix: tests now instantiate the real MarketplacePage(), not a hand-rolled stub.
// HTTP blocking is solved by injecting a fake http.Client (package:http/testing.dart) via
// ApiService(httpClient: ...) — real widget, fake transport.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/pages/marketplace_page.dart';
import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';
import 'package:nftmarket/services/api_service.dart';

// ── helpers ─────────────────────────────────────────────────────────────────

/// Build an [ApiService] whose HTTP transport replies with [listings].
ApiService _apiWithListings(List<Map<String, dynamic>> listings) {
  final client = MockClient((request) async {
    return http.Response(
      jsonEncode({'listings': listings}),
      200,
      headers: {'content-type': 'application/json'},
    );
  });
  return ApiService(httpClient: client);
}

/// Build an [ApiService] whose HTTP transport always throws a network error.
ApiService _apiWithError() {
  final client = MockClient((_) async {
    throw Exception('Connection refused');
  });
  return ApiService(httpClient: client);
}

Widget _wrap(Widget child, WalletProvider wallet) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<WalletProvider>.value(value: wallet),
      ChangeNotifierProxyProvider<WalletProvider, MintProvider>(
        create: (_) => MintProvider(),
        update: (_, w, m) => m!..updateWallet(w),
      ),
    ],
    child: MaterialApp(home: child),
  );
}

// ── tests ────────────────────────────────────────────────────────────────────

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late WalletProvider wallet;

  setUp(() => wallet = WalletProvider());
  tearDown(() => wallet.disconnect());

  group('MarketplacePage — loading state', () {
    testWidgets('shows CircularProgressIndicator before data arrives',
        (tester) async {
      // Use a Completer so we control exactly when the response arrives.
      final completer = Completer<http.Response>();
      final client = MockClient((_) => completer.future);
      final api = ApiService(httpClient: client);

      await tester.pumpWidget(_wrap(MarketplacePage(apiService: api), wallet));
      // Don't settle — just process the first frame.
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      // Clean up: resolve so no pending timers remain.
      completer.complete(http.Response(
        jsonEncode({'listings': []}),
        200,
        headers: {'content-type': 'application/json'},
      ));
      await tester.pumpAndSettle();
    });
  });

  group('MarketplacePage — empty state', () {
    testWidgets('shows "No NFTs for sale" when listings array is empty',
        (tester) async {
      final api = _apiWithListings([]);

      await tester.pumpWidget(_wrap(MarketplacePage(apiService: api), wallet));
      // Pump until async work settles.
      await tester.pumpAndSettle();

      expect(find.text('No NFTs for sale'), findsOneWidget);
      expect(find.text('Be the first to list your artwork!'), findsOneWidget);
    });
  });

  group('MarketplacePage — success state', () {
    testWidgets('renders a listing card with name and price', (tester) async {
      final api = _apiWithListings([
        {
          'tokenId': 1,
          'name': 'Golden Sunrise',
          'priceEth': '2.5',
          'seller': '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234',
          'licenseType': 'display',
          'imageUrl': null,
        }
      ]);

      await tester.pumpWidget(_wrap(MarketplacePage(apiService: api), wallet));
      await tester.pumpAndSettle();

      expect(find.text('Golden Sunrise'), findsOneWidget);
      expect(find.textContaining('2.5'), findsWidgets);
    });

    testWidgets('renders multiple listing cards', (tester) async {
      final api = _apiWithListings([
        {
          'tokenId': 1,
          'name': 'Alpha',
          'priceEth': '1.0',
          'seller': '0x1111111111111111111111111111111111111111',
          'licenseType': 'display',
          'imageUrl': null,
        },
        {
          'tokenId': 2,
          'name': 'Beta',
          'priceEth': '2.0',
          'seller': '0x2222222222222222222222222222222222222222',
          'licenseType': 'commercial',
          'imageUrl': null,
        },
      ]);

      await tester.pumpWidget(_wrap(MarketplacePage(apiService: api), wallet));
      await tester.pumpAndSettle();

      expect(find.text('Alpha'), findsOneWidget);
      expect(find.text('Beta'), findsOneWidget);
    });
  });

  group('MarketplacePage — error state', () {
    testWidgets('shows error message and Retry button on network failure',
        (tester) async {
      final api = _apiWithError();

      await tester.pumpWidget(_wrap(MarketplacePage(apiService: api), wallet));
      await tester.pumpAndSettle();

      // The real page shows an error column when _error is non-null.
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('Retry button triggers a second load', (tester) async {
      int callCount = 0;
      final client = MockClient((request) async {
        callCount++;
        if (callCount == 1) throw Exception('first call fails');
        return http.Response(
          jsonEncode({'listings': []}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final api = ApiService(httpClient: client);

      await tester.pumpWidget(_wrap(MarketplacePage(apiService: api), wallet));
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      // After retry the second call succeeded → empty state, not error.
      expect(find.text('No NFTs for sale'), findsOneWidget);
      expect(callCount, equals(2));
    });
  });
}
