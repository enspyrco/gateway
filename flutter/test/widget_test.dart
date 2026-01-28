// Basic smoke test for NFTmarket app

import 'package:flutter_test/flutter_test.dart';
import 'package:nftmarket/main.dart';

void main() {
  testWidgets('App renders without error', (WidgetTester tester) async {
    // Build the app
    await tester.pumpWidget(const NFTmarketApp());

    // Verify app title appears
    expect(find.text('NFTmarket'), findsWidgets);
  });
}
