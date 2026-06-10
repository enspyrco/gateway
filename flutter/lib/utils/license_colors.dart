import 'package:flutter/material.dart';

import '../models/token.dart';
import '../theme.dart';

/// Single source of truth for license-type colours.
///
/// All callers work with the [LicenseType] enum.  String inputs at the UI
/// boundary must be parsed via [LicenseType.fromString] before calling here.
Color licenseColor(LicenseType license) {
  switch (license) {
    case LicenseType.display:
      return NFTmarketColors.displayBlue;
    case LicenseType.commercial:
      return NFTmarketColors.commercialOrange;
    case LicenseType.transfer:
      return NFTmarketColors.transferPurple;
  }
}

/// Convenience overload for callers that still hold a raw String (e.g. JSON
/// from the API).  Falls back to [NFTmarketColors.textMuted] for unknown values
/// rather than throwing — consistent with the old per-file defaults.
Color licenseColorFromString(String? type) {
  if (type == null) return NFTmarketColors.textMuted;
  return switch (type.toLowerCase()) {
    'display' => NFTmarketColors.displayBlue,
    'commercial' => NFTmarketColors.commercialOrange,
    'transfer' => NFTmarketColors.transferPurple,
    _ => NFTmarketColors.textMuted,
  };
}
