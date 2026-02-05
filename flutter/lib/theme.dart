import 'package:flutter/material.dart';

/// Opacity constants for consistent visual hierarchy
/// Use these instead of magic numbers like 0.15 or 0.3
class NFTmarketOpacity {
  // Subtle - barely visible backgrounds, borders
  static const double subtle = 0.06;      // Border overlays
  static const double faint = 0.08;       // Very light backgrounds
  static const double light = 0.1;        // Light backgrounds
  static const double muted = 0.12;       // Muted badge backgrounds

  // Medium - visible but not dominant
  static const double soft = 0.15;        // Soft backgrounds, disabled states
  static const double medium = 0.2;       // Medium emphasis, hover states
  static const double moderate = 0.3;     // Moderate emphasis, borders

  // Strong - clearly visible
  static const double emphasis = 0.4;     // Strong borders, active states
  static const double strong = 0.5;       // Strong emphasis, selected states

  // Near opaque - almost solid
  static const double prominent = 0.8;    // Prominent elements
  static const double vivid = 0.9;        // Very visible, status badges
  static const double intense = 0.95;     // Nearly solid
}

/// NFTmarket Premium Dark Theme Colors
///
/// Design inspiration: Luxury art galleries, premium crypto platforms
/// (Foundation, SuperRare), high-end e-commerce
class NFTmarketColors {
  // Background layers (darkest to lightest)
  static const background = Color(0xFF0D0D0F);
  static const surface = Color(0xFF141418);
  static const surfaceLight = Color(0xFF1C1C22);
  static const surfaceBorder = Color(0x0FFFFFFF); // rgba(255,255,255,0.06)

  // Accent colors
  static const accent = Color(0xFFC9A962);       // Gold - primary accent
  static const accentLight = Color(0xFFE5D4A1);  // Light gold - highlights
  static const primary = Color(0xFF6366F1);       // Indigo - interactive
  static const primaryLight = Color(0xFF818CF8);  // Lighter indigo

  // Text hierarchy
  static const textPrimary = Color(0xFFFFFFFF);   // White
  static const textSecondary = Color(0xFF9CA3AF); // Gray 400
  static const textMuted = Color(0xFF6B7280);     // Gray 500
  static const textBody = Color(0xFFE5E7EB);      // Gray 200

  // Status colors (refined for dark backgrounds)
  static const success = Color(0xFF34D399);       // Emerald 400
  static const warning = Color(0xFFFBBF24);       // Amber 400
  static const error = Color(0xFFF87171);         // Red 400
  static const info = Color(0xFF60A5FA);          // Blue 400

  // License badge colors (darker, premium)
  static const displayBlue = Color(0xFF3B82F6);     // Blue 500
  static const commercialOrange = Color(0xFFF59E0B); // Amber 500
  static const transferPurple = Color(0xFFA855F7);   // Purple 500

  // Card gradient colors
  static const cardGradientStart = Color(0xFF141418);
  static const cardGradientEnd = Color(0xFF1A1A20);

  // Hover/focus glow
  static Color get accentGlow => accent.withValues(alpha: NFTmarketOpacity.medium);
  static Color get primaryGlow => primary.withValues(alpha: NFTmarketOpacity.moderate);
}

class NFTmarketTheme {
  static const primaryColor = NFTmarketColors.primary;
  static const secondaryColor = Color(0xFF8B5CF6); // Purple
  static const successColor = NFTmarketColors.success;
  static const errorColor = NFTmarketColors.error;
  static const warningColor = NFTmarketColors.warning;

  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.light,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: Colors.grey.shade200),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.grey.shade50,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: primaryColor, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
    );
  }

  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: NFTmarketColors.background,
      colorScheme: ColorScheme.dark(
        surface: NFTmarketColors.surface,
        primary: NFTmarketColors.primary,
        secondary: NFTmarketColors.accent,
        error: NFTmarketColors.error,
        onPrimary: Colors.white,
        onSurface: NFTmarketColors.textPrimary,
        onError: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: NFTmarketColors.background,
        foregroundColor: NFTmarketColors.textPrimary,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: NFTmarketColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(
            color: NFTmarketColors.surfaceBorder,
            width: 1,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: NFTmarketColors.surfaceBorder,
        thickness: 1,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: NFTmarketColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: NFTmarketColors.textPrimary,
          side: const BorderSide(color: NFTmarketColors.surfaceBorder),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: NFTmarketColors.accent,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: NFTmarketColors.surfaceLight,
        hintStyle: const TextStyle(color: NFTmarketColors.textMuted),
        labelStyle: const TextStyle(color: NFTmarketColors.textSecondary),
        prefixIconColor: NFTmarketColors.textMuted,
        suffixIconColor: NFTmarketColors.textMuted,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: NFTmarketColors.surfaceBorder,
            width: 1,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: NFTmarketColors.accent, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: NFTmarketColors.surfaceLight,
        labelStyle: const TextStyle(color: NFTmarketColors.textSecondary),
        side: const BorderSide(color: NFTmarketColors.surfaceBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: NFTmarketColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: NFTmarketColors.surfaceBorder),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: NFTmarketColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: NFTmarketColors.surfaceBorder),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: NFTmarketColors.surfaceLight,
        contentTextStyle: const TextStyle(color: NFTmarketColors.textPrimary),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: NFTmarketColors.accent,
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.bold,
        ),
        displayMedium: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.bold,
        ),
        displaySmall: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.bold,
        ),
        headlineLarge: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.bold,
        ),
        headlineMedium: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.bold,
        ),
        headlineSmall: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.bold,
        ),
        titleLarge: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
        titleMedium: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
        titleSmall: TextStyle(
          color: NFTmarketColors.textPrimary,
          fontWeight: FontWeight.w500,
        ),
        bodyLarge: TextStyle(color: NFTmarketColors.textBody),
        bodyMedium: TextStyle(color: NFTmarketColors.textBody),
        bodySmall: TextStyle(color: NFTmarketColors.textSecondary),
        labelLarge: TextStyle(color: NFTmarketColors.textPrimary),
        labelMedium: TextStyle(color: NFTmarketColors.textSecondary),
        labelSmall: TextStyle(color: NFTmarketColors.textMuted),
      ),
      iconTheme: const IconThemeData(
        color: NFTmarketColors.textSecondary,
      ),
    );
  }
}
