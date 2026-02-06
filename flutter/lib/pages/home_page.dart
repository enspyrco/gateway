import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';
import '../theme.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Logo/brand with gold accent
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    NFTmarketColors.accent.withValues(alpha: 0.15),
                    NFTmarketColors.primary.withValues(alpha: 0.1),
                  ],
                ),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: NFTmarketColors.accent.withValues(alpha: 0.3),
                ),
              ),
              child: const Text(
                'NFTmarket',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: NFTmarketColors.textPrimary,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
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
                  const SizedBox(height: 80),
                  _buildActionCards(context),
                  const SizedBox(height: 80),
                  _buildTechFeatures(context),
                  const SizedBox(height: 80),
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
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: Alignment.center,
          radius: 1.5,
          colors: [
            NFTmarketColors.accent.withValues(alpha: 0.08),
            NFTmarketColors.background,
          ],
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        children: [
          // Main headline with gold accent
          RichText(
            textAlign: TextAlign.center,
            text: TextSpan(
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: NFTmarketColors.textPrimary,
                    height: 1.2,
                  ),
              children: [
                const TextSpan(text: 'AI Art with '),
                TextSpan(
                  text: 'Verified Provenance',
                  style: TextStyle(
                    color: NFTmarketColors.accent,
                    shadows: [
                      Shadow(
                        color: NFTmarketColors.accent.withValues(alpha: 0.3),
                        blurRadius: 20,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Watermark, mint, and sell your AI-generated artwork with clear copyright licensing.',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: NFTmarketColors.textSecondary,
                  fontWeight: FontWeight.normal,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 40),
          Consumer<WalletProvider>(
            builder: (context, wallet, _) {
              if (wallet.isConnected) {
                return _PremiumButton(
                  onPressed: () => context.go('/mint'),
                  icon: Icons.add,
                  label: 'Mint Your Art',
                  isPrimary: true,
                );
              }
              return _PremiumButton(
                onPressed: wallet.isConnecting ? null : () => wallet.connect(),
                icon: wallet.isConnecting ? null : Icons.account_balance_wallet,
                label: wallet.isConnecting
                    ? 'Connecting...'
                    : 'Connect Wallet to Start',
                isPrimary: true,
                isLoading: wallet.isConnecting,
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildActionCards(BuildContext context) {
    return Column(
      children: [
        _buildSectionHeader(context, 'Get Started'),
        const SizedBox(height: 32),
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
              accentColor: NFTmarketColors.accent,
            ),
            _FeatureCard(
              icon: Icons.storefront,
              title: 'Marketplace',
              description:
                  'Buy and sell AI artwork with clear licensing terms.',
              actionLabel: 'Browse',
              onAction: () => context.go('/marketplace'),
              accentColor: NFTmarketColors.primary,
            ),
            _FeatureCard(
              icon: Icons.collections,
              title: 'Gallery',
              description: 'Explore collections from artists around the world.',
              actionLabel: 'View',
              onAction: () => context.go('/gallery'),
              accentColor: NFTmarketColors.transferPurple,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTechFeatures(BuildContext context) {
    return Column(
      children: [
        _buildSectionHeader(context, 'How We Protect Your Art'),
        const SizedBox(height: 32),
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
              accentColor: NFTmarketColors.info,
            ),
            _FeatureCard(
              icon: Icons.gavel,
              title: 'Clear Licensing',
              description:
                  'Choose display, commercial, or full transfer rights.',
              accentColor: NFTmarketColors.commercialOrange,
            ),
            _FeatureCard(
              icon: Icons.verified,
              title: 'NFT Provenance',
              description: 'On-chain record of ownership and transfer history.',
              accentColor: NFTmarketColors.success,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildHowItWorks(BuildContext context) {
    return Column(
      children: [
        _buildSectionHeader(context, 'How It Works'),
        const SizedBox(height: 40),
        LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth > 800;
            return Wrap(
              spacing: isWide ? 24 : 16,
              runSpacing: 24,
              alignment: WrapAlignment.center,
              children: [
                _StepCard(
                    number: '1',
                    title: 'Upload',
                    description: 'Select your AI artwork',
                    isFirst: true),
                if (isWide) _buildConnector(),
                _StepCard(
                    number: '2',
                    title: 'Choose License',
                    description: 'Display, commercial, or transfer'),
                if (isWide) _buildConnector(),
                _StepCard(
                    number: '3',
                    title: 'Sign & Mint',
                    description: 'Watermark applied, NFT created'),
                if (isWide) _buildConnector(),
                _StepCard(
                    number: '4',
                    title: 'Sell or Verify',
                    description: 'Trade or prove authenticity',
                    isLast: true),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title) {
    return Column(
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: NFTmarketColors.textPrimary,
              ),
        ),
        const SizedBox(height: 8),
        Container(
          width: 60,
          height: 3,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [NFTmarketColors.accent, NFTmarketColors.primary],
            ),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    );
  }

  Widget _buildConnector() {
    return Container(
      width: 40,
      height: 2,
      margin: const EdgeInsets.only(top: 24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            NFTmarketColors.accent.withValues(alpha: 0.5),
            NFTmarketColors.accent.withValues(alpha: 0.2),
          ],
        ),
        borderRadius: BorderRadius.circular(1),
      ),
    );
  }
}

class _PremiumButton extends StatefulWidget {
  final VoidCallback? onPressed;
  final IconData? icon;
  final String label;
  final bool isPrimary;
  final bool isLoading;

  const _PremiumButton({
    required this.onPressed,
    this.icon,
    required this.label,
    this.isPrimary = false,
    this.isLoading = false,
  });

  @override
  State<_PremiumButton> createState() => _PremiumButtonState();
}

class _PremiumButtonState extends State<_PremiumButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          gradient: widget.isPrimary
              ? LinearGradient(
                  colors: [
                    NFTmarketColors.primary,
                    NFTmarketColors.primary.withValues(alpha: 0.8),
                  ],
                )
              : null,
          borderRadius: BorderRadius.circular(12),
          border: widget.isPrimary
              ? null
              : Border.all(color: NFTmarketColors.accent),
          boxShadow: _isHovered && widget.isPrimary
              ? [
                  BoxShadow(
                    color: NFTmarketColors.primary.withValues(alpha: 0.4),
                    blurRadius: 20,
                    spreadRadius: 0,
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onPressed,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.isLoading)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  else if (widget.icon != null)
                    Icon(
                      widget.icon,
                      size: 20,
                      color: widget.isPrimary
                          ? Colors.white
                          : NFTmarketColors.accent,
                    ),
                  if (widget.icon != null || widget.isLoading)
                    const SizedBox(width: 10),
                  Text(
                    widget.label,
                    style: TextStyle(
                      color: widget.isPrimary
                          ? Colors.white
                          : NFTmarketColors.accent,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FeatureCard extends StatefulWidget {
  final IconData icon;
  final String title;
  final String description;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Color accentColor;

  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.description,
    this.actionLabel,
    this.onAction,
    required this.accentColor,
  });

  @override
  State<_FeatureCard> createState() => _FeatureCardState();
}

class _FeatureCardState extends State<_FeatureCard> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 280,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              NFTmarketColors.cardGradientStart,
              NFTmarketColors.cardGradientEnd,
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: _isHovered
                ? widget.accentColor.withValues(alpha: 0.4)
                : NFTmarketColors.surfaceBorder,
            width: _isHovered ? 1.5 : 1,
          ),
          boxShadow: _isHovered
              ? [
                  BoxShadow(
                    color: widget.accentColor.withValues(alpha: 0.15),
                    blurRadius: 20,
                    spreadRadius: 0,
                  ),
                ]
              : null,
        ),
        child: Column(
          children: [
            // Icon with gradient background
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    widget.accentColor.withValues(alpha: 0.2),
                    widget.accentColor.withValues(alpha: 0.1),
                  ],
                ),
                shape: BoxShape.circle,
                border: Border.all(
                  color: widget.accentColor.withValues(alpha: 0.3),
                  width: 1.5,
                ),
              ),
              child: Icon(
                widget.icon,
                size: 28,
                color: widget.accentColor,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              widget.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: NFTmarketColors.textPrimary,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              widget.description,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: NFTmarketColors.textSecondary,
                height: 1.5,
              ),
            ),
            if (widget.actionLabel != null && widget.onAction != null) ...[
              const SizedBox(height: 20),
              TextButton(
                onPressed: widget.onAction,
                style: TextButton.styleFrom(
                  foregroundColor: widget.accentColor,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(
                      color: widget.accentColor.withValues(alpha: 0.4),
                    ),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.actionLabel!,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: widget.accentColor,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.arrow_forward,
                      size: 16,
                      color: widget.accentColor,
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StepCard extends StatefulWidget {
  final String number;
  final String title;
  final String description;
  final bool isFirst;
  final bool isLast;

  const _StepCard({
    required this.number,
    required this.title,
    required this.description,
    this.isFirst = false,
    this.isLast = false,
  });

  @override
  State<_StepCard> createState() => _StepCardState();
}

class _StepCardState extends State<_StepCard> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 180,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              NFTmarketColors.cardGradientStart,
              NFTmarketColors.cardGradientEnd,
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: _isHovered
                ? NFTmarketColors.accent.withValues(alpha: 0.4)
                : NFTmarketColors.surfaceBorder,
            width: _isHovered ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            // Step number with gold ring
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: _isHovered
                    ? const LinearGradient(
                        colors: [
                          NFTmarketColors.accent,
                          NFTmarketColors.primary
                        ],
                      )
                    : null,
                color: _isHovered ? null : NFTmarketColors.surfaceLight,
                shape: BoxShape.circle,
                border: Border.all(
                  color: NFTmarketColors.accent,
                  width: 2,
                ),
                boxShadow: _isHovered
                    ? [
                        BoxShadow(
                          color: NFTmarketColors.accent.withValues(alpha: 0.3),
                          blurRadius: 12,
                        ),
                      ]
                    : null,
              ),
              child: Center(
                child: Text(
                  widget.number,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: _isHovered ? Colors.white : NFTmarketColors.accent,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              widget.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: NFTmarketColors.textPrimary,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              widget.description,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: NFTmarketColors.textSecondary,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
