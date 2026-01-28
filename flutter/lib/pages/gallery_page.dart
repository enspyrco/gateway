import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../services/api_service.dart';
import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';

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
    final address = _searchController.text.trim();
    if (address.isNotEmpty &&
        address.startsWith('0x') &&
        address.length == 42) {
      context.go('/gallery/$address');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Please enter a valid wallet address (0x...)')),
      );
    }
  }

  bool get _isOwnGallery {
    final wallet = context.read<WalletProvider>();
    return widget.address == null ||
        wallet.address?.toLowerCase() == widget.address?.toLowerCase();
  }

  String get _pageTitle {
    if (widget.address == null) {
      return 'Galleries';
    }
    final shortAddress =
        '${widget.address!.substring(0, 6)}...${widget.address!.substring(widget.address!.length - 4)}';
    return 'Gallery: $shortAddress';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_pageTitle),
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
              hintText: 'Enter wallet address (0x...)',
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
    final shortAddress = _ownerAddress != null && _ownerAddress!.length > 10
        ? '${_ownerAddress!.substring(0, 6)}...${_ownerAddress!.substring(_ownerAddress!.length - 4)}'
        : _ownerAddress ?? '';

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
                label: Text(shortAddress, style: const TextStyle(fontSize: 12)),
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
              return _GalleryCard(
                gallery: gallery,
                onTap: () => context.go('/gallery/${gallery['address']}'),
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

  const _GalleryCard({required this.gallery, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final address = gallery['address'] ?? '';
    final shortAddress = address.length > 10
        ? '${address.substring(0, 6)}...${address.substring(address.length - 4)}'
        : address;
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
                      shortAddress,
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

  const _TokenCard({required this.token, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = token['name'] ?? 'NFT #${token['tokenId']}';
    final previewUrl = token['previewUrl'];
    final licenseType = token['licenseType'] ?? 'unknown';
    final creator = token['creator'] ?? '';
    final shortCreator = creator.length > 10
        ? '${creator.substring(0, 6)}...${creator.substring(creator.length - 4)}'
        : creator;

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
                    'Creator: $shortCreator',
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
