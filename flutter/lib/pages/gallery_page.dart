import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/token.dart';
import '../services/api_service.dart';
import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';
import '../theme.dart';

/// Resolve wallet address to nickname (for test accounts)
String? _resolveNickname(String address, List<TestAccount> accounts) {
  final lower = address.toLowerCase();
  for (final account in accounts) {
    if (account.address.toLowerCase() == lower) {
      return account.nickname;
    }
  }
  if (platformWallet.address.toLowerCase() == lower) {
    return platformWallet.nickname;
  }
  return null;
}

/// Format address with nickname if available
String _formatAddress(String address, List<TestAccount> accounts) {
  final nickname = _resolveNickname(address, accounts);
  if (nickname != null) {
    return nickname;
  }
  if (address.length > 10) {
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }
  return address;
}

class GalleryPage extends StatefulWidget {
  final String? address;

  const GalleryPage({super.key, this.address});

  @override
  State<GalleryPage> createState() => _GalleryPageState();
}

class _GalleryPageState extends State<GalleryPage> {
  List<Map<String, dynamic>> _tokens = [];
  List<Map<String, dynamic>> _galleries = [];
  bool _loading = true;
  String? _error;
  String? _ownerAddress;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(GalleryPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reload data when navigating to a different gallery
    if (oldWidget.address != widget.address) {
      _loadData();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final wallet = context.read<WalletProvider>();
    final targetAddress = widget.address ?? wallet.address;
    if (targetAddress != _ownerAddress) {
      _loadData();
    }
  }

  Future<void> _loadData() async {
    final wallet = context.read<WalletProvider>();
    final targetAddress = widget.address ?? wallet.address;

    setState(() {
      _loading = true;
      _error = null;
      _ownerAddress = targetAddress;
    });

    try {
      final api = ApiService();

      // Always load the gallery list for discovery
      final galleries = await api.getGalleryList();

      // Load tokens if we have an address to show
      List<Map<String, dynamic>> tokens = [];
      if (targetAddress != null) {
        tokens = await api.getGallery(targetAddress);
      }

      setState(() {
        _galleries = galleries;
        _tokens = tokens;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _searchGallery() {
    final input = _searchController.text.trim();
    final wallet = context.read<WalletProvider>();
    final accounts = wallet.availableAccounts;

    // Check if input is a test account nickname
    String? address;
    for (final account in accounts) {
      if (account.nickname.toLowerCase() == input.toLowerCase()) {
        address = account.address;
        break;
      }
    }
    if (address == null &&
        platformWallet.nickname.toLowerCase() == input.toLowerCase()) {
      address = platformWallet.address;
    }

    // If not a nickname, check if it's a valid address
    if (address == null && input.startsWith('0x') && input.length == 42) {
      address = input;
    }

    if (address != null) {
      context.go('/gallery/$address');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
              'Enter a wallet address (0x...) or name (Alice, Bob, etc.)'),
          backgroundColor: NFTmarketColors.surfaceLight,
        ),
      );
    }
  }

  bool get _isOwnGallery {
    final wallet = context.read<WalletProvider>();
    return widget.address == null ||
        wallet.address?.toLowerCase() == widget.address?.toLowerCase();
  }

  String _getPageTitle(List<TestAccount> accounts) {
    if (widget.address == null) {
      return 'Galleries';
    }
    return 'Gallery: ${_formatAddress(widget.address!, accounts)}';
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final accounts = wallet.availableAccounts;

    return Scaffold(
      appBar: AppBar(
        title: Text(_getPageTitle(accounts)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (widget.address != null) {
              context.go('/gallery');
            } else {
              context.go('/');
            }
          },
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
            Text('Error loading gallery',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(color: NFTmarketColors.textSecondary)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadData,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      color: NFTmarketColors.accent,
      backgroundColor: NFTmarketColors.surface,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Search bar
                  _buildSearchBar(),
                  const SizedBox(height: 24),

                  // Show user's tokens if viewing a specific gallery
                  if (widget.address != null || _ownerAddress != null) ...[
                    _buildUserGallery(),
                    const SizedBox(height: 32),
                  ],

                  // Gallery discovery section
                  _buildGalleryDiscovery(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSearchBar() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _searchController,
            style: const TextStyle(color: NFTmarketColors.textPrimary),
            decoration: InputDecoration(
              hintText: 'Enter name (Alice, Bob...) or address (0x...)',
              prefixIcon:
                  const Icon(Icons.search, color: NFTmarketColors.textMuted),
              filled: true,
              fillColor: NFTmarketColors.surfaceLight,
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
                borderSide:
                    const BorderSide(color: NFTmarketColors.accent, width: 2),
              ),
            ),
            onSubmitted: (_) => _searchGallery(),
          ),
        ),
        const SizedBox(width: 12),
        ElevatedButton(
          onPressed: _searchGallery,
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            backgroundColor: NFTmarketColors.primary,
          ),
          child: const Text('View Gallery'),
        ),
      ],
    );
  }

  Widget _buildUserGallery() {
    final wallet = context.watch<WalletProvider>();
    final accounts = wallet.availableAccounts;
    final displayName =
        _ownerAddress != null ? _formatAddress(_ownerAddress!, accounts) : '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            // Section header with gold accent
            Container(
              padding: const EdgeInsets.only(bottom: 4),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: NFTmarketColors.accent, width: 2),
                ),
              ),
              child: Text(
                _isOwnGallery ? 'My Collection' : 'Collection',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: NFTmarketColors.textPrimary,
                    ),
              ),
            ),
            if (!_isOwnGallery) ...[
              const SizedBox(width: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: NFTmarketColors.surfaceLight,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: NFTmarketColors.surfaceBorder),
                ),
                child: Text(
                  displayName,
                  style: const TextStyle(
                    fontSize: 12,
                    color: NFTmarketColors.textSecondary,
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 20),
        if (_tokens.isEmpty)
          _buildEmptyState(
            icon: Icons.collections_outlined,
            title: _isOwnGallery ? 'No artworks yet' : 'This gallery is empty',
            showAction: _isOwnGallery && wallet.isConnected,
            actionLabel: 'Mint Your First NFT',
            onAction: () => context.go('/mint'),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 280,
              childAspectRatio: 0.8,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
            ),
            itemCount: _tokens.length,
            itemBuilder: (context, index) {
              final token = _tokens[index];
              return _TokenCard(
                token: token,
                onTap: () => context.go('/token/${token['tokenId']}'),
                accounts: accounts,
              );
            },
          ),
      ],
    );
  }

  Widget _buildGalleryDiscovery() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header with gold accent
        Container(
          padding: const EdgeInsets.only(bottom: 4),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: NFTmarketColors.accent, width: 2),
            ),
          ),
          child: Text(
            'Browse Galleries',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: NFTmarketColors.textPrimary,
                ),
          ),
        ),
        const SizedBox(height: 20),
        if (_galleries.isEmpty)
          _buildEmptyState(
            icon: Icons.people_outline,
            title: 'No galleries yet',
            subtitle: 'Be the first to mint an NFT!',
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 300,
              childAspectRatio: 2.5,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
            ),
            itemCount: _galleries.length,
            itemBuilder: (context, index) {
              final gallery = _galleries[index];
              final wallet = context.read<WalletProvider>();
              return _GalleryCard(
                gallery: gallery,
                onTap: () => context.go('/gallery/${gallery['address']}'),
                accounts: wallet.availableAccounts,
              );
            },
          ),
      ],
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    String? subtitle,
    bool showAction = false,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
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
        border: Border.all(color: NFTmarketColors.surfaceBorder),
      ),
      child: Column(
        children: [
          Icon(icon, size: 48, color: NFTmarketColors.textMuted),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(color: NFTmarketColors.textSecondary),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 8),
            Text(
              subtitle,
              style: const TextStyle(
                  color: NFTmarketColors.textMuted, fontSize: 12),
            ),
          ],
          if (showAction && actionLabel != null && onAction != null) ...[
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.add),
              label: Text(actionLabel),
            ),
          ],
        ],
      ),
    );
  }
}

class _GalleryCard extends StatefulWidget {
  final Map<String, dynamic> gallery;
  final VoidCallback onTap;
  final List<TestAccount> accounts;

  const _GalleryCard(
      {required this.gallery, required this.onTap, required this.accounts});

  @override
  State<_GalleryCard> createState() => _GalleryCardState();
}

class _GalleryCardState extends State<_GalleryCard> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final address = widget.gallery['address'] ?? '';
    final displayName = _formatAddress(address, widget.accounts);
    final tokenCount = widget.gallery['tokenCount'] ?? 0;
    final previewName = widget.gallery['previewTokenName'] ?? 'NFT';

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
                    blurRadius: 12,
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
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          NFTmarketColors.accent.withValues(alpha: 0.2),
                          NFTmarketColors.primary.withValues(alpha: 0.2),
                        ],
                      ),
                      shape: BoxShape.circle,
                      border:
                          Border.all(color: NFTmarketColors.accent, width: 1.5),
                    ),
                    child: const Icon(
                      Icons.account_circle,
                      color: NFTmarketColors.accent,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          displayName,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: NFTmarketColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$tokenCount NFT${tokenCount == 1 ? '' : 's'} · $previewName',
                          style: const TextStyle(
                            color: NFTmarketColors.textSecondary,
                            fontSize: 12,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 16,
                    color: _isHovered
                        ? NFTmarketColors.accent
                        : NFTmarketColors.textMuted,
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

class _TokenCard extends StatefulWidget {
  final Map<String, dynamic> token;
  final VoidCallback onTap;
  final List<TestAccount> accounts;

  const _TokenCard(
      {required this.token, required this.onTap, required this.accounts});

  @override
  State<_TokenCard> createState() => _TokenCardState();
}

class _TokenCardState extends State<_TokenCard> {
  bool _isHovered = false;

  Color _getLicenseColor(String type) {
    switch (type.toLowerCase()) {
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

  String _formatLicenseType(String type) {
    switch (type.toLowerCase()) {
      case 'display':
        return 'Display License';
      case 'commercial':
        return 'Commercial License';
      case 'transfer':
        return 'Full Copyright';
      default:
        return type;
    }
  }

  String _formatListingLabel(String licenseType) {
    switch (licenseType.toLowerCase()) {
      case 'display':
        return 'Display';
      case 'commercial':
        return 'Commercial';
      case 'transfer':
        return 'Full Transfer';
      default:
        return 'For Sale';
    }
  }

  String _formatPriceShort(String? priceEth) {
    if (priceEth == null) return '';
    final price = double.tryParse(priceEth) ?? 0;
    if (price >= 1) {
      return '${price.toStringAsFixed(1)} ETH';
    } else {
      return '${price.toStringAsFixed(3)} ETH';
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.token['name'] ?? 'NFT #${widget.token['tokenId']}';
    final imageUrl = Token.imageUrlFromJson(widget.token);
    // ownerLicense shows the current owner's license level
    final ownerLicense = widget.token['ownerLicense'] ??
        widget.token['licenseType'] ??
        'unknown';
    final creator = widget.token['creator'] ?? '';
    final creatorName = _formatAddress(creator, widget.accounts);
    final copyrightOwner = widget.token['copyrightOwner'] ?? creator;
    final copyrightOwnerName = _formatAddress(copyrightOwner, widget.accounts);
    final isOriginal = widget.token['isOriginal'] ?? true;
    final licenseColor = _getLicenseColor(ownerLicense);

    // Multi-license listing info
    final isListed = widget.token['isListed'] == true;
    final listings = widget.token['listings'] as List<dynamic>? ?? [];
    // Legacy fallback for single listing
    final listingLicenseType = widget.token['listingLicenseType'] as String?;
    final listingColor = listings.isNotEmpty
        ? _getLicenseColor(listings[0]['licenseType'] as String? ?? '')
        : listingLicenseType != null
            ? _getLicenseColor(listingLicenseType)
            : NFTmarketColors.accent;

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
            color: isListed
                ? listingColor.withValues(alpha: 0.5)
                : _isHovered
                    ? NFTmarketColors.accentGlow
                    : NFTmarketColors.surfaceBorder,
            width: isListed || _isHovered ? 1.5 : 1,
          ),
          boxShadow: _isHovered
              ? [
                  BoxShadow(
                    color: isListed
                        ? listingColor.withValues(alpha: 0.2)
                        : NFTmarketColors.accentGlow,
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
                      // Show "For Sale" badges if listed (top-left) - multi-license support
                      if (isListed)
                        Positioned(
                          top: 8,
                          left: 8,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // "FOR SALE" header
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: NFTmarketColors.accent
                                      .withValues(alpha: 0.95),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: const [
                                    Icon(
                                      Icons.local_offer,
                                      size: 10,
                                      color: Colors.white,
                                    ),
                                    SizedBox(width: 3),
                                    Text(
                                      'FOR SALE',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 8,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 4),
                              // Show each listing type with price
                              if (listings.isNotEmpty)
                                ...listings.map<Widget>((listing) {
                                  final type =
                                      listing['licenseType'] as String? ?? '';
                                  final priceEth =
                                      listing['priceEth'] as String?;
                                  final color = _getLicenseColor(type);
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 2),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: color.withValues(alpha: 0.9),
                                        borderRadius: BorderRadius.circular(4),
                                        boxShadow: [
                                          BoxShadow(
                                            color: color.withValues(alpha: 0.3),
                                            blurRadius: 4,
                                          ),
                                        ],
                                      ),
                                      child: Text(
                                        '${_formatListingLabel(type)}: ${_formatPriceShort(priceEth)}',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 9,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  );
                                })
                              else if (listingLicenseType != null)
                                // Legacy single listing fallback
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: listingColor.withValues(alpha: 0.9),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    _formatListingLabel(listingLicenseType),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      // Show badge for original vs license (top-right)
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: (isOriginal
                                    ? NFTmarketColors.success
                                    : NFTmarketColors.info)
                                .withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: isOriginal
                                  ? NFTmarketColors.success
                                  : NFTmarketColors.info,
                              width: 1,
                            ),
                          ),
                          child: Text(
                            isOriginal ? 'Original' : 'License',
                            style: TextStyle(
                              color: isOriginal
                                  ? NFTmarketColors.success
                                  : NFTmarketColors.info,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
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
                      // License badge with premium styling
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: licenseColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: licenseColor.withValues(alpha: 0.4),
                            width: 1,
                          ),
                        ),
                        child: Text(
                          _formatLicenseType(ownerLicense),
                          style: TextStyle(
                            color: licenseColor,
                            fontWeight: FontWeight.w500,
                            fontSize: 11,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Creator: $creatorName',
                        style: const TextStyle(
                          color: NFTmarketColors.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                      if (copyrightOwner != creator)
                        Text(
                          'Copyright: $copyrightOwnerName',
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
