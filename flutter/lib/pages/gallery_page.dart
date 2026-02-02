import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../services/api_service.dart';
import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';

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
    if (address == null && platformWallet.nickname.toLowerCase() == input.toLowerCase()) {
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
        const SnackBar(
            content: Text('Enter a wallet address (0x...) or name (Alice, Bob, etc.)')),
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
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text('Error loading gallery',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Colors.grey.shade600)),
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
            decoration: InputDecoration(
              hintText: 'Enter name (Alice, Bob...) or address (0x...)',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
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
          ),
          child: const Text('View Gallery'),
        ),
      ],
    );
  }

  Widget _buildUserGallery() {
    final wallet = context.watch<WalletProvider>();
    final accounts = wallet.availableAccounts;
    final displayName = _ownerAddress != null ? _formatAddress(_ownerAddress!, accounts) : '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              _isOwnGallery ? 'My Collection' : 'Collection',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            if (!_isOwnGallery) ...[
              const SizedBox(width: 8),
              Chip(
                label: Text(displayName, style: const TextStyle(fontSize: 12)),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
        const SizedBox(height: 16),
        if (_tokens.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.collections_outlined,
                        size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 12),
                    Text(
                      _isOwnGallery
                          ? 'No artworks yet'
                          : 'This gallery is empty',
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                    if (_isOwnGallery && wallet.isConnected) ...[
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: () => context.go('/mint'),
                        icon: const Icon(Icons.add),
                        label: const Text('Mint Your First NFT'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 280,
              childAspectRatio: 0.85,
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
        Text(
          'Browse Galleries',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 16),
        if (_galleries.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.people_outline,
                        size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 12),
                    Text(
                      'No galleries yet',
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Be the first to mint an NFT!',
                      style:
                          TextStyle(color: Colors.grey.shade500, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
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
}

class _GalleryCard extends StatelessWidget {
  final Map<String, dynamic> gallery;
  final VoidCallback onTap;
  final List<TestAccount> accounts;

  const _GalleryCard({required this.gallery, required this.onTap, required this.accounts});

  @override
  Widget build(BuildContext context) {
    final address = gallery['address'] ?? '';
    final displayName = _formatAddress(address, accounts);
    final tokenCount = gallery['tokenCount'] ?? 0;
    final previewName = gallery['previewTokenName'] ?? 'NFT';

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: Theme.of(context)
                    .colorScheme
                    .primary
                    .withValues(alpha: 0.1),
                child: Icon(Icons.account_circle,
                    color: Theme.of(context).colorScheme.primary),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      displayName,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$tokenCount NFT${tokenCount == 1 ? '' : 's'} · $previewName',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 12,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward_ios,
                  size: 16, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}

class _TokenCard extends StatelessWidget {
  final Map<String, dynamic> token;
  final VoidCallback onTap;
  final List<TestAccount> accounts;

  const _TokenCard({required this.token, required this.onTap, required this.accounts});

  @override
  Widget build(BuildContext context) {
    final name = token['name'] ?? 'NFT #${token['tokenId']}';
    final previewUrl = token['previewUrl'];
    final licenseType = token['licenseType'] ?? 'unknown';
    final creator = token['creator'] ?? '';
    final creatorName = _formatAddress(creator, accounts);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: previewUrl != null
                  ? Image.network(
                      previewUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _placeholder(),
                    )
                  : _placeholder(),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .primary
                          .withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      _formatLicenseType(licenseType),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.w500,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Creator: $creatorName',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatLicenseType(String type) {
    switch (type) {
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

  Widget _placeholder() {
    return Container(
      color: Colors.grey.shade200,
      child: Icon(Icons.image, size: 48, color: Colors.grey.shade400),
    );
  }
}
