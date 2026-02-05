import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NFTmarket'),
        actions: const [
          WalletButton(),
          SizedBox(width: 16),
        ],
      ),
      body: SingleChildScrollView(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(height: 48),
                  _buildHero(context),
                  const SizedBox(height: 64),
                  _buildActionCards(context),
                  const SizedBox(height: 64),
                  _buildTechFeatures(context),
                  const SizedBox(height: 64),
                  _buildHowItWorks(context),
                  const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHero(BuildContext context) {
    return Column(
      children: [
        Text(
          'AI Art with Verified Provenance',
          style: Theme.of(context).textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        Text(
          'Watermark, mint, and sell your AI-generated artwork with clear copyright licensing.',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: Colors.grey,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        Consumer<WalletProvider>(
          builder: (context, wallet, _) {
            if (wallet.isConnected) {
              return ElevatedButton.icon(
                onPressed: () => context.go('/mint'),
                icon: const Icon(Icons.add),
                label: const Text('Mint Your Art'),
              );
            }
            return ElevatedButton.icon(
              onPressed: wallet.isConnecting ? null : () => wallet.connect(),
              icon: wallet.isConnecting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.account_balance_wallet),
              label: Text(wallet.isConnecting
                  ? 'Connecting...'
                  : 'Connect Wallet to Start'),
            );
          },
        ),
      ],
    );
  }

  Widget _buildActionCards(BuildContext context) {
    return Column(
      children: [
        Text(
          'Get Started',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 24,
          runSpacing: 24,
          alignment: WrapAlignment.center,
          children: [
            _FeatureCard(
              icon: Icons.auto_awesome,
              title: 'Generate AI Art',
              description:
                  'Create stunning artwork with AI, then mint it as an NFT.',
              actionLabel: 'Generate',
              onAction: () => context.go('/generate'),
            ),
            _FeatureCard(
              icon: Icons.storefront,
              title: 'Marketplace',
              description:
                  'Buy and sell AI artwork with clear licensing terms.',
              actionLabel: 'Browse',
              onAction: () => context.go('/marketplace'),
            ),
            _FeatureCard(
              icon: Icons.collections,
              title: 'Gallery',
              description:
                  'Explore collections from artists around the world.',
              actionLabel: 'View',
              onAction: () => context.go('/gallery'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTechFeatures(BuildContext context) {
    return Column(
      children: [
        Text(
          'How We Protect Your Art',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 24,
          runSpacing: 24,
          alignment: WrapAlignment.center,
          children: [
            _FeatureCard(
              icon: Icons.fingerprint,
              title: 'Invisible Watermark',
              description:
                  'Survives print, scan, and screenshot. Your proof of origin.',
            ),
            _FeatureCard(
              icon: Icons.gavel,
              title: 'Clear Licensing',
              description: 'Choose display, commercial, or full transfer rights.',
            ),
            _FeatureCard(
              icon: Icons.verified,
              title: 'NFT Provenance',
              description: 'On-chain record of ownership and transfer history.',
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildHowItWorks(BuildContext context) {
    return Column(
      children: [
        Text(
          'How It Works',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 32),
        Wrap(
          spacing: 48,
          runSpacing: 24,
          alignment: WrapAlignment.center,
          children: [
            _StepCard(
                number: '1',
                title: 'Upload',
                description: 'Select your AI artwork'),
            _StepCard(
                number: '2',
                title: 'Choose License',
                description: 'Display, commercial, or transfer'),
            _StepCard(
                number: '3',
                title: 'Sign & Mint',
                description: 'Watermark applied, NFT created'),
            _StepCard(
                number: '4',
                title: 'Sell or Verify',
                description: 'Trade or prove authenticity'),
          ],
        ),
      ],
    );
  }

}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.description,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 250,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(icon,
                  size: 48, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 16),
              Text(
                title,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                description,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600),
              ),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: onAction,
                  child: Text(actionLabel!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  final String number;
  final String title;
  final String description;

  const _StepCard({
    required this.number,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 200,
      child: Column(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Theme.of(context).colorScheme.primary,
            foregroundColor: Colors.white,
            child: Text(
              number,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }
}
