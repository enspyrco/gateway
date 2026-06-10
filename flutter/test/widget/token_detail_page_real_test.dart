// Real-widget tests for TokenDetailPage (cage-match PR #48 follow-up).
// Pumps the actual page with a fake HTTP transport (package:http/testing.dart)
// injected via ApiService(httpClient: ...) — same pattern as
// marketplace_page_test.dart. The stub-based suites (token_detail_page_test,
// regression/token_detail_test) cover layout details; these tests exercise
// the page's real load/render paths.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:nftmarket/pages/token_detail_page.dart';
import 'package:nftmarket/providers/wallet_provider.dart';
import 'package:nftmarket/providers/mint_provider.dart';
import 'package:nftmarket/services/api_service.dart';

// ── helpers ─────────────────────────────────────────────────────────────────

Map<String, dynamic> _tokenJson({int tokenId = 7}) => {
      'tokenId': tokenId,
      'name': 'Golden Sunrise',
      'description': 'A test artwork',
      'creator': '0x1111111111111111111111111111111111111111',
      'currentOwner': '0x2222222222222222222222222222222222222222',
      'mintedAt': '2026-01-15T10:00:00Z',
      'imageUrl': null,
    };

http.Response _json(Map<String, dynamic> body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

/// ApiService whose transport answers /api/verify/:id with [token] and
/// /api/marketplace/:id with [listing] (404 when null — token not listed).
ApiService _api({Map<String, dynamic>? token, Map<String, dynamic>? listing}) {
  final client = MockClient((request) async {
    final path = request.url.path;
    if (path.startsWith('/api/verify/')) {
      return _json(token ?? _tokenJson());
    }
    if (path.startsWith('/api/marketplace/')) {
      if (listing == null) {
        return _json({'error': 'Not listed'}, 404);
      }
      return _json(listing);
    }
    return _json({'error': 'unexpected route $path'}, 500);
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

  /// The page lays out a side-by-side desktop view (maxWidth 1000); the
  /// default 800x600 test surface overflows its info rows. Give tests a
  /// desktop-sized viewport, restored automatically afterwards.
  Future<void> pumpPage(WidgetTester tester, ApiService api) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
        _wrap(TokenDetailPage(tokenId: 7, apiService: api), wallet));
  }

  group('TokenDetailPage (real widget) — loading state', () {
    testWidgets('shows CircularProgressIndicator before data arrives',
        (tester) async {
      final completer = Completer<http.Response>();
      final client = MockClient((_) => completer.future);
      final api = ApiService(httpClient: client);

      await pumpPage(tester, api);
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Resolve so no pending futures remain (verify + listing share it).
      completer.complete(_json(_tokenJson()));
      await tester.pumpAndSettle();
    });
  });

  group('TokenDetailPage (real widget) — unlisted token', () {
    testWidgets('renders name and details; no License Offered row',
        (tester) async {
      final api = _api(); // listing → 404

      await pumpPage(tester, api);
      await tester.pumpAndSettle();

      expect(find.text('Golden Sunrise'), findsOneWidget);
      expect(find.text('A test artwork'), findsOneWidget);
      expect(find.text('License Offered'), findsNothing);
    });
  });

  group('TokenDetailPage (real widget) — listed token', () {
    testWidgets(
        'shows License Offered with the canonical LicenseType display name',
        (tester) async {
      final api = _api(listing: {
        'listed': true,
        'licenseType': 'display',
        'priceEth': '1.0',
      });

      await pumpPage(tester, api);
      await tester.pumpAndSettle();

      expect(find.text('License Offered'), findsOneWidget);
      // Must match LicenseType.display.displayName — the page no longer has
      // its own divergent copy ('Display Only') of this mapping.
      expect(find.text('Display'), findsWidgets);
      expect(find.text('Display Only'), findsNothing);
    });
  });

  group('TokenDetailPage (real widget) — error state', () {
    testWidgets('shows error message and Retry button on network failure',
        (tester) async {
      final client = MockClient((_) async {
        throw Exception('Connection refused');
      });
      final api = ApiService(httpClient: client);

      await pumpPage(tester, api);
      await tester.pumpAndSettle();

      expect(find.text('Error loading token'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('Retry triggers a second load that can succeed',
        (tester) async {
      int callCount = 0;
      final client = MockClient((request) async {
        callCount++;
        if (callCount == 1) throw Exception('first call fails');
        final path = request.url.path;
        if (path.startsWith('/api/verify/')) return _json(_tokenJson());
        return _json({'error': 'Not listed'}, 404);
      });
      final api = ApiService(httpClient: client);

      await pumpPage(tester, api);
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.text('Golden Sunrise'), findsOneWidget);
      expect(find.text('Error loading token'), findsNothing);
    });
  });
}
