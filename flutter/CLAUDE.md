# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Flutter App Overview

Flutter web frontend for the NFTmarket platform. See the root `CLAUDE.md` for full project architecture.

## Commands

```bash
flutter pub get                    # Install dependencies
flutter run -d chrome              # Run in Chrome
flutter test                       # Run tests
flutter analyze                    # Static analysis
dart format .                      # Format code
flutter build web                  # Build for production
```

Hot reload: press `r` in terminal. Full restart (needed for provider changes): press `R`.

## Code Structure

```
lib/
├── main.dart              # App entry, MultiProvider setup
├── router.dart            # GoRouter routes with wallet guards
├── theme.dart             # Light/dark theme definitions
├── models/token.dart      # Token, LicenseType, MintResult
├── providers/
│   ├── wallet_provider.dart   # Wallet connection, SIWE auth tokens
│   └── mint_provider.dart     # Mint flow state machine
├── services/
│   └── api_service.dart       # Backend API client
├── pages/
│   ├── home_page.dart         # Landing page
│   ├── generate_page.dart     # AI art generation UI
│   ├── mint_page.dart         # Upload/mint flow
│   ├── marketplace_page.dart  # Browse listings
│   ├── gallery_page.dart      # Gallery browser + user collections
│   ├── token_detail_page.dart # Single token view
│   └── verify_page.dart       # Watermark verification
└── widgets/
    └── wallet_button.dart     # Wallet connect/disconnect UI
```

## State Management

Uses Provider pattern:

- `WalletProvider`: Manages wallet connection state, generates SIWE auth tokens
- `MintProvider`: Tracks multi-step mint flow (image → details → license → mint)

Providers are wired in `main.dart` with `ChangeNotifierProxyProvider` so MintProvider receives wallet updates.

## Routing

Uses `go_router`. Protected routes redirect to home if wallet not connected:

```dart
redirect: (context, state) {
  final wallet = context.read<WalletProvider>();
  if (!wallet.isConnected) return '/?connect=true';
  return null;
}
```

## API Communication

`ApiService` handles all backend calls. Auth token passed in constructor:

```dart
final api = ApiService(authToken: wallet.authToken);
```

Backend URL configured via `--dart-define=API_URL=http://localhost:3000`.

## Test Accounts (Debug Mode)

In debug mode (`kDebugMode`), wallet button shows test account picker instead of WalletConnect. Four Hardhat accounts available for testing marketplace buy/sell flows.

ChainId is 31337 (Hardhat) in debug mode, 137 (Polygon) in release.

## Key Patterns

- Pages are stateful, load data in `initState`
- Use `context.read<Provider>()` for one-time reads, `context.watch<Provider>()` in build
- Images from generated art passed to mint page via `GoRouter.extra`
- All API errors caught and displayed in UI with retry buttons

## Gallery Routes

- `/gallery` - Browse all galleries, search by address, view own collection
- `/gallery/:address` - View specific user's gallery
