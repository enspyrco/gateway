import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/api_service.dart';
import '../widgets/wallet_button.dart';
import '../theme.dart';

class MarketplacePage extends StatefulWidget {
  const MarketplacePage({super.key});

  @override
  State<MarketplacePage> createState() => _MarketplacePageState();
}

class _MarketplacePageState extends State<MarketplacePage> {
  List<Map<String, dynamic>> _listings = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadListings();
  }

  Future<void> _loadListings() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final api = ApiService();
      final listings = await api.getListings();
      setState(() {
        _listings = listings;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Marketplace'),
            const SizedBox(width: 12),
            // Premium badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: NFTmarketColors.accent.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: NFTmarketColors.accent.withValues(alpha: 0.4),
                ),
              ),
              child: const Text(
                'LIVE',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: NFTmarketColors.accent,
                  letterSpacing: 1,
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
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(
          color: NFTmarketColors.accent,
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: NFTmarketColors.textMuted),
            const SizedBox(height: 16),
            Text('Error loading marketplace',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(color: NFTmarketColors.textSecondary)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadListings,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_listings.isEmpty) {
      return Center(
        child: Container(
          padding: const EdgeInsets.all(48),
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Premium empty state icon
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      NFTmarketColors.accent.withValues(alpha: 0.1),
                      NFTmarketColors.primary.withValues(alpha: 0.1),
                    ],
                  ),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: NFTmarketColors.surfaceBorder,
                    width: 2,
                  ),
                ),
                child: const Icon(
                  Icons.storefront,
                  size: 48,
                  color: NFTmarketColors.accent,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'No NFTs for sale',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: NFTmarketColors.textPrimary,
                    ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Be the first to list your artwork!',
                style: TextStyle(color: NFTmarketColors.textSecondary),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () => context.go('/mint'),
                icon: const Icon(Icons.add),
                label: const Text('Mint an NFT'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: NFTmarketColors.primary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadListings,
      color: NFTmarketColors.accent,
      backgroundColor: NFTmarketColors.surface,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: GridView.builder(
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 300,
            childAspectRatio: 0.72,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
          ),
          itemCount: _listings.length,
          itemBuilder: (context, index) {
            final listing = _listings[index];
            return _ListingCard(
              listing: listing,
              onTap: () => context.go('/token/${listing['tokenId']}'),
            );
          },
        ),
      ),
    );
  }
}

class _ListingCard extends StatefulWidget {
  final Map<String, dynamic> listing;
  final VoidCallback onTap;

  const _ListingCard({required this.listing, required this.onTap});

  @override
  State<_ListingCard> createState() => _ListingCardState();
}

class _ListingCardState extends State<_ListingCard> {
  bool _isHovered = false;

  Color _getLicenseColor(String? licenseType) {
    switch (licenseType?.toLowerCase()) {
      case 'display':
        return NFTmarketColors.displayBlue;
      case 'commercial':
        return NFTmarketColors.commercialOrange;
      case 'transfer':
        return NFTmarketColors.transferPurple;
      default:
        return NFTmarketColors.textMuted;
    }
  }

  String _getLicenseLabel(String? licenseType) {
    switch (licenseType?.toLowerCase()) {
      case 'display':
        return 'Display';
      case 'commercial':
        return 'Commercial';
      case 'transfer':
        return 'Full Transfer';
      default:
        return 'Unknown';
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.listing['name'] ?? 'NFT #${widget.listing['tokenId']}';
    final price = widget.listing['priceEth'] ?? '?';
    // Use imageUrl from blockchain IPFS URI, fallback to previewUrl for backwards compatibility
    final imageUrl = widget.listing['imageUrl'] ?? widget.listing['previewUrl'];
    final seller = widget.listing['seller'] ?? '';
    final shortSeller = seller.length > 10
        ? '${seller.substring(0, 6)}...${seller.substring(seller.length - 4)}'
        : seller;
    final licenseType = widget.listing['licenseType'] as String?;
    final licenseColor = _getLicenseColor(licenseType);

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
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
                ? NFTmarketColors.accentGlow
                : NFTmarketColors.surfaceBorder,
            width: _isHovered ? 1.5 : 1,
          ),
          boxShadow: _isHovered
              ? [
                  BoxShadow(
                    color: NFTmarketColors.accentGlow,
                    blurRadius: 16,
                    spreadRadius: 0,
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(15),
                        ),
                        child: imageUrl != null
                            ? Image.network(
                                imageUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _placeholder(),
                              )
                            : _placeholder(),
                      ),
                      // License type badge in top-right corner
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: licenseColor.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: licenseColor,
                              width: 1,
                            ),
                          ),
                          child: Text(
                            _getLicenseLabel(licenseType),
                            style: TextStyle(
                              color: licenseColor,
                              fontWeight: FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: NFTmarketColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      // Premium gold price display
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              NFTmarketColors.accent.withValues(alpha: 0.15),
                              NFTmarketColors.accent.withValues(alpha: 0.08),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color:
                                NFTmarketColors.accent.withValues(alpha: 0.3),
                            width: 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // ETH diamond icon styled
                            Container(
                              width: 18,
                              height: 18,
                              decoration: BoxDecoration(
                                color: NFTmarketColors.accent
                                    .withValues(alpha: 0.2),
                                shape: BoxShape.circle,
                              ),
                              child: const Center(
                                child: Text(
                                  '◆',
                                  style: TextStyle(
                                    color: NFTmarketColors.accent,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '$price ETH',
                              style: const TextStyle(
                                color: NFTmarketColors.accent,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Seller: $shortSeller',
                        style: const TextStyle(
                          color: NFTmarketColors.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: NFTmarketColors.surfaceLight,
      child: const Icon(
        Icons.image,
        size: 48,
        color: NFTmarketColors.textMuted,
      ),
    );
  }
}
