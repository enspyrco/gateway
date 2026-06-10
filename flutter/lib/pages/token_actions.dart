import 'package:flutter/foundation.dart';

import '../models/token.dart';
import '../providers/wallet_provider.dart';
import '../services/api_service.dart';

/// Result from a token transaction (list, delist, buy).
///
/// Returning a typed result rather than manipulating BuildContext lets the
/// page decide what to show.  The three flows no longer carry UI logic;
/// they are testable without a widget tree.
class TokenActionResult {
  final bool success;
  final String? txHash;
  final String? errorMessage;

  const TokenActionResult.ok(this.txHash)
      : success = true,
        errorMessage = null;

  const TokenActionResult.err(this.errorMessage)
      : success = false,
        txHash = null;
}

/// Pure transaction logic for a single token.
///
/// Takes [tokenId], [api], and [wallet] as dependencies — no BuildContext.
/// The calling page is responsible for showing snackbars / triggering reloads.
class TokenActions {
  final int tokenId;
  final ApiService api;
  final WalletProvider wallet;

  const TokenActions({
    required this.tokenId,
    required this.api,
    required this.wallet,
  });

  /// List [tokenId] at [priceEth] ETH under [licenseType].
  Future<TokenActionResult> list(
      String priceEth, LicenseType licenseType) async {
    try {
      final prepareResult = await api.prepareListing(
        tokenId: tokenId,
        priceEth: priceEth,
        licenseType: licenseType.name,
      );

      debugPrint('Prepare listing result: $prepareResult');

      final typedData = prepareResult['typedData'] as Map<String, dynamic>;
      final contractCall =
          prepareResult['contractCall'] as Map<String, dynamic>;

      final signatureBytes = await wallet.signTypedData(typedData);
      final signatureHex =
          '0x${signatureBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';

      final encodeResult = await api.encodeListTransaction(
        tokenId: contractCall['params']['tokenId'] as int,
        price: contractCall['params']['price'].toString(),
        licenseType: contractCall['params']['licenseType'] as int,
        licenseHash: contractCall['params']['licenseHash'] as String,
        expiry: contractCall['params']['expiry'] as int,
        signature: signatureHex,
      );

      final contractAddress = await api.getContractAddress();
      final txResult = await wallet.sendTransaction(
        to: contractAddress,
        data: encodeResult['txData'] as String,
      );

      debugPrint('List tx hash: ${txResult.hash}');
      return TokenActionResult.ok(txResult.hash);
    } catch (e, stackTrace) {
      debugPrint('List error: $e');
      debugPrint('$stackTrace');
      return TokenActionResult.err(e.toString());
    }
  }

  /// Delist [tokenId] (remove from marketplace).
  Future<TokenActionResult> delist(String licenseType) async {
    try {
      final prepareResult = await api.prepareDelisting(
        tokenId: tokenId,
        licenseType: licenseType,
      );

      debugPrint('Delist prepare result: $prepareResult');

      final contractCall =
          prepareResult['contractCall'] as Map<String, dynamic>;

      final encodeResult = await api.encodeDelistTransaction(
        tokenId: contractCall['params']['tokenId'] as int,
        licenseType: licenseType,
      );

      final contractAddress = await api.getContractAddress();
      final txResult = await wallet.sendTransaction(
        to: contractAddress,
        data: encodeResult['txData'] as String,
      );

      debugPrint('Delist tx hash: ${txResult.hash}');
      return TokenActionResult.ok(txResult.hash);
    } catch (e, stackTrace) {
      debugPrint('Delist error: $e');
      debugPrint('$stackTrace');
      return TokenActionResult.err(e.toString());
    }
  }

  /// Buy [tokenId] under [licenseType].
  Future<TokenActionResult> buy(String licenseType) async {
    try {
      final prepareResult = await api.preparePurchase(
        tokenId: tokenId,
        licenseType: licenseType,
      );

      if (prepareResult['success'] != true) {
        throw Exception(prepareResult['error'] ?? 'Failed to prepare purchase');
      }

      final typedData = prepareResult['typedData'] as Map<String, dynamic>;
      final signatureBytes = await wallet.signTypedData(typedData);
      final signatureHex =
          '0x${signatureBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';

      final encodeResult = await api.encodeBuyTransaction(
        tokenId: tokenId,
        licenseType: licenseType,
        signature: signatureHex,
      );

      final contractAddress = await api.getContractAddress();
      final txResult = await wallet.sendTransaction(
        to: contractAddress,
        data: encodeResult['txData'] as String,
        value: encodeResult['value'] as String,
      );

      debugPrint('Buy tx hash: ${txResult.hash}');
      return TokenActionResult.ok(txResult.hash);
    } catch (e, stackTrace) {
      debugPrint('Buy error: $e');
      debugPrint('$stackTrace');
      return TokenActionResult.err(e.toString());
    }
  }
}
