import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/token.dart';
import '../services/api_service.dart';
import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';

class TokenDetailPage extends StatefulWidget {
  final int tokenId;

  const TokenDetailPage({super.key, required this.tokenId});

  @override
  State<TokenDetailPage> createState() => _TokenDetailPageState();
}

class _TokenDetailPageState extends State<TokenDetailPage> {
  Token? _token;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _listing;
  bool _actionLoading = false;

  @override
  void initState() {
    super.initState();
    _loadToken();
  }

  Future<void> _loadToken() async {
    try {
      final api = ApiService();
      final token = await api.getTokenInfo(widget.tokenId);

      // Try to get listing info (may fail if not listed or not authed)
      Map<String, dynamic>? listing;
      try {
        final wallet = context.read<WalletProvider>();
        if (wallet.isConnected) {
          final authedApi = ApiService(authToken: wallet.authToken);
          listing = await authedApi.getListing(widget.tokenId);
        }
      } catch (_) {
        // Token may not be listed, that's okay
      }

      setState(() {
        _token = token;
        _listing = listing;
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
        title: Text('Token #${widget.tokenId}'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
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
            Text('Error loading token',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadToken,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    final token = _token!;
    final wallet = context.watch<WalletProvider>();
    final isOwner = wallet.isConnected &&
        wallet.address?.toLowerCase() == token.currentOwner.toLowerCase();

    return SingleChildScrollView(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1000),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Image
                Expanded(
                  flex: 3,
                  child: Card(
                    clipBehavior: Clip.antiAlias,
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: token.previewUrl != null
                          ? Image.network(
                              token.previewUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _imagePlaceholder(),
                            )
                          : _imagePlaceholder(),
                    ),
                  ),
                ),
                const SizedBox(width: 24),
                // Details
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        token.name,
                        style: Theme.of(context)
                            .textTheme
                            .headlineMedium
                            ?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                      const SizedBox(height: 8),
                      if (token.description.isNotEmpty) ...[
                        Text(
                          token.description,
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 16),
                      ],
                      _buildChip(token.licenseType.displayName, Icons.gavel),
                      const SizedBox(height: 24),
                      _buildInfoCard(token, isOwner),
                      const SizedBox(height: 16),
                      _buildActionButtons(token, isOwner),
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

  Widget _imagePlaceholder() {
    return Container(
      color: Colors.grey.shade200,
      child: Icon(
        Icons.image,
        size: 64,
        color: Colors.grey.shade400,
      ),
    );
  }

  Widget _buildChip(String label, IconData icon) {
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      backgroundColor:
          Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
      side: BorderSide.none,
    );
  }

  Widget _buildInfoCard(Token token, bool isOwner) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _buildInfoRow(
              'Creator',
              _shortAddress(token.creator),
              trailing: InkWell(
                onTap: () => context.go('/gallery/${token.creator}'),
                child: const Icon(Icons.collections, size: 20),
              ),
            ),
            const Divider(),
            _buildInfoRow(
              'Owner',
              _shortAddress(token.currentOwner),
              trailing: isOwner
                  ? const Chip(
                      label: Text('You', style: TextStyle(fontSize: 12)),
                      backgroundColor: Colors.green,
                      labelStyle: TextStyle(color: Colors.white),
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    )
                  : InkWell(
                      onTap: () => context.go('/gallery/${token.currentOwner}'),
                      child: const Icon(Icons.collections, size: 20),
                    ),
            ),
            const Divider(),
            _buildInfoRow('License', token.licenseType.displayName),
            const Divider(),
            _buildInfoRow('Minted', _formatDate(token.mintedAt)),
            if (token.watermarkId != null) ...[
              const Divider(),
              _buildInfoRow('Watermark ID', token.watermarkId!),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade600)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            trailing,
          ],
        ],
      ),
    );
  }

  Widget _buildActionButtons(Token token, bool isOwner) {
    final isListed = _listing?['listed'] == true;
    final price = _listing?['priceEth'];
    final wallet = context.read<WalletProvider>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Marketplace actions
        if (isOwner && !isListed) ...[
          ElevatedButton.icon(
            onPressed: _actionLoading ? null : () => _showListDialog(),
            icon: _actionLoading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sell),
            label: const Text('List for Sale'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
        ],
        if (isOwner && isListed) ...[
          Card(
            color: Colors.green.shade50,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Icon(Icons.local_offer, color: Colors.green),
                  const SizedBox(width: 8),
                  Text('Listed for $price ETH',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _actionLoading ? null : () => _delist(),
            icon: const Icon(Icons.remove_shopping_cart),
            label: const Text('Remove Listing'),
            style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
          ),
          const SizedBox(height: 8),
        ],
        if (!isOwner && isListed && wallet.isConnected) ...[
          ElevatedButton.icon(
            onPressed: _actionLoading ? null : () => _buy(),
            icon: _actionLoading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.shopping_cart),
            label: Text('Buy for $price ETH'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.all(16),
            ),
          ),
          const SizedBox(height: 8),
        ],
        if (!isOwner && isListed && !wallet.isConnected) ...[
          ElevatedButton.icon(
            onPressed: () => wallet.connect(),
            icon: const Icon(Icons.account_balance_wallet),
            label: Text('Connect Wallet to Buy ($price ETH)'),
          ),
          const SizedBox(height: 8),
        ],
        const Divider(height: 24),
        OutlinedButton.icon(
          onPressed: () => context.go('/verify/${widget.tokenId}'),
          icon: const Icon(Icons.verified),
          label: const Text('Verify Authenticity'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => _copyLink(),
          icon: const Icon(Icons.share),
          label: const Text('Share'),
        ),
        if (token.transactionHash != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => _openExplorer(token.transactionHash!),
            icon: const Icon(Icons.open_in_new),
            label: const Text('View on Polygonscan'),
          ),
        ],
      ],
    );
  }

  Future<void> _showListDialog() async {
    final priceController = TextEditingController();

    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('List for Sale'),
        content: TextField(
          controller: priceController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Price in ETH',
            hintText: '0.1',
            suffixText: 'ETH',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, priceController.text),
            child: const Text('List'),
          ),
        ],
      ),
    );

    if (result != null && result.isNotEmpty) {
      await _list(result);
    }
  }

  Future<void> _list(String priceEth) async {
    setState(() => _actionLoading = true);

    try {
      final wallet = context.read<WalletProvider>();
      final api = ApiService(authToken: wallet.authToken);

      // Convert ETH to Wei (1 ETH = 10^18 Wei)
      final priceWei = (double.parse(priceEth) * 1e18).toStringAsFixed(0);

      await api.listToken(tokenId: widget.tokenId, priceWei: priceWei);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Listed for $priceEth ETH!')),
      );

      await _loadToken(); // Refresh
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to list: $e')),
      );
    } finally {
      setState(() => _actionLoading = false);
    }
  }

  Future<void> _delist() async {
    setState(() => _actionLoading = true);

    try {
      final wallet = context.read<WalletProvider>();
      final api = ApiService(authToken: wallet.authToken);

      await api.delistToken(widget.tokenId);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Listing removed')),
      );

      await _loadToken(); // Refresh
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to delist: $e')),
      );
    } finally {
      setState(() => _actionLoading = false);
    }
  }

  Future<void> _buy() async {
    setState(() => _actionLoading = true);

    try {
      final wallet = context.read<WalletProvider>();
      final api = ApiService(authToken: wallet.authToken);

      await api.buyToken(widget.tokenId);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Purchase successful! You now own this NFT.')),
      );

      await _loadToken(); // Refresh to show new owner
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to buy: $e')),
      );
    } finally {
      setState(() => _actionLoading = false);
    }
  }

  String _shortAddress(String address) {
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  void _copyLink() {
    final url = 'https://nftmarket.com/token/${widget.tokenId}';
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Link copied to clipboard')),
    );
  }

  Future<void> _openExplorer(String txHash) async {
    final url = Uri.parse('https://polygonscan.com/tx/$txHash');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }
}
