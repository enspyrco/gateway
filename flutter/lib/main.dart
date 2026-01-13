import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'providers/wallet_provider.dart';
import 'providers/mint_provider.dart';
import 'router.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NFTmarketApp());
}

class NFTmarketApp extends StatelessWidget {
  const NFTmarketApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => WalletProvider()),
        ChangeNotifierProxyProvider<WalletProvider, MintProvider>(
          create: (_) => MintProvider(),
          update: (_, wallet, mint) => mint!..updateWallet(wallet),
        ),
      ],
      child: MaterialApp.router(
        title: 'NFTmarket',
        theme: NFTmarketTheme.light,
        darkTheme: NFTmarketTheme.dark,
        themeMode: ThemeMode.system,
        routerConfig: router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}
