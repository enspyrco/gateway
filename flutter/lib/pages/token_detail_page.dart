import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/token.dart';
import '../services/api_service.dart';
import '../services/contract_service.dart';
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

      // Try to get listing info (public endpoint, no auth needed)
      Map<String, dynamic>? listing;
      try {
        listing = await api.getListing(widget.tokenId);
        debugPrint('Listing data for token ${widget.tokenId}: $listing');
      } catch (e) {
        debugPrint('Failed to get listing: $e');
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
                      const SizedBox(height: 8),
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

  Widget _buildInfoCard(Token token, bool isOwner) {
    final isListed = _listing?['listed'] == true;
    final listingLicenseType = _listing?['licenseType'];

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
            if (isListed && listingLicenseType != null) ...[
              const Divider(),
              _buildInfoRow('License Offered', _getLicenseDisplayName(listingLicenseType)),
            ],
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

  String _getLicenseDisplayName(String licenseType) {
    switch (licenseType) {
      case 'display':
        return 'Display Only';
      case 'commercial':
        return 'Commercial';
      case 'transfer':
        return 'Full Transfer';
      default:
        return licenseType;
    }
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

    debugPrint('Action buttons: isOwner=$isOwner, isListed=$isListed, isConnected=${wallet.isConnected}, listing=$_listing');

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
          Card(
            color: Colors.blue.shade50,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.verified_user, color: Colors.blue, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'Bilateral Agreement Required',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue.shade800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'By clicking Buy, you will sign a license agreement that will be recorded on-chain.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.blue.shade700,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
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
    LicenseType selectedLicense = LicenseType.display;
    String? priceError;

    bool isValidPrice(String value) {
      if (value.isEmpty) return false;
      final parsed = double.tryParse(value);
      return parsed != null && parsed > 0;
    }

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('List for Sale'),
          content: SizedBox(
            width: 400,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Card(
                  color: Colors.amber.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Icon(Icons.edit_document, color: Colors.amber.shade800, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'You will sign a binding agreement to sell under the chosen license terms.',
                            style: TextStyle(fontSize: 12, color: Colors.amber.shade900),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: priceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Price in ETH',
                    hintText: '0.1',
                    suffixText: 'ETH',
                    errorText: priceError,
                  ),
                  onChanged: (value) {
                    setDialogState(() {
                      priceError = null;
                    });
                  },
                ),
                const SizedBox(height: 24),
                Text(
                  'License Type',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  'Choose what rights the buyer will receive',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                ),
                const SizedBox(height: 12),
                ...LicenseType.values.map((license) {
                  final isSelected = selectedLicense == license;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      onTap: () => setDialogState(() => selectedLicense = license),
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isSelected
                                ? Theme.of(context).colorScheme.primary
                                : Colors.grey.shade300,
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              isSelected
                                  ? Icons.radio_button_checked
                                  : Icons.radio_button_unchecked,
                              color: isSelected
                                  ? Theme.of(context).colorScheme.primary
                                  : Colors.grey.shade400,
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    license.displayName,
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  Text(
                                    license.description,
                                    style: TextStyle(
                                      color: Colors.grey.shade600,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton.icon(
              icon: const Icon(Icons.edit, size: 18),
              onPressed: () {
                if (!isValidPrice(priceController.text)) {
                  setDialogState(() {
                    priceError = 'Please enter a valid price';
                  });
                  return;
                }
                Navigator.pop(context, {
                  'price': priceController.text,
                  'license': selectedLicense,
                });
              },
              label: const Text('Sign & List'),
            ),
          ],
        ),
      ),
    );

    debugPrint('Dialog result: $result');
    if (result != null && result['price'] != null && result['price'].isNotEmpty) {
      await _list(result['price'], result['license']);
    } else {
      debugPrint('List cancelled or no price entered');
    }
  }

  Future<void> _list(String priceEth, LicenseType licenseType) async {
    debugPrint('_list called with price: $priceEth, license: $licenseType');
    setState(() => _actionLoading = true);

    try {
      final wallet = context.read<WalletProvider>();

      // Step 1: Call backend to prepare listing (backend handles all logic)
      final api = ApiService(authToken: wallet.authToken);
      final prepareResult = await api.prepareListing(
        tokenId: widget.tokenId,
        priceEth: priceEth,
        licenseType: licenseType.name,
      );

      debugPrint('Prepare result: $prepareResult');

      // Step 2: Sign the typed data via wallet service
      final typedData = prepareResult['typedData'] as Map<String, dynamic>;
      final contractCall = prepareResult['contractCall'] as Map<String, dynamic>;

      final signature = await wallet.signTypedData(typedData);

      // Step 3: Submit transaction via wallet service
      // Get contract address from contract service
      final contractService = await ContractService.getInstance();
      final contractAddress = contractService.contractAddress;

      // Build transaction data for list() call
      final txData = _encodeListCall(
        tokenId: contractCall['params']['tokenId'] as int,
        price: BigInt.parse(contractCall['params']['price'].toString()),
        licenseType: contractCall['params']['licenseType'] as int,
        licenseHash: contractCall['params']['licenseHash'] as String,
        expiry: BigInt.from(contractCall['params']['expiry'] as int),
        signature: signature,
      );

      final txResult = await wallet.sendTransaction(
        to: contractAddress,
        data: txData,
      );

      debugPrint('List transaction hash: ${txResult.hash}');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Listed for $priceEth ETH with ${licenseType.displayName} license!')),
        );
      }

      await _loadToken(); // Refresh
    } catch (e, stackTrace) {
      debugPrint('List error: $e');
      debugPrint('Stack trace: $stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to list: $e')),
        );
      }
    } finally {
      setState(() => _actionLoading = false);
    }
  }

  Future<void> _delist() async {
    setState(() => _actionLoading = true);

    try {
      final wallet = context.read<WalletProvider>();

      // Step 1: Call backend to validate and prepare delisting
      final api = ApiService(authToken: wallet.authToken);
      final prepareResult = await api.prepareDelisting(tokenId: widget.tokenId);

      debugPrint('Delist prepare result: $prepareResult');

      // Step 2: Submit transaction via wallet service
      final contractService = await ContractService.getInstance();
      final contractAddress = contractService.contractAddress;
      final contractCall = prepareResult['contractCall'] as Map<String, dynamic>;

      // Build transaction data for delist() call
      final txData = _encodeDelistCall(
        tokenId: contractCall['params']['tokenId'] as int,
      );

      final txResult = await wallet.sendTransaction(
        to: contractAddress,
        data: txData,
      );

      debugPrint('Delist transaction hash: ${txResult.hash}');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Listing removed')),
        );
      }

      await _loadToken(); // Refresh
    } catch (e) {
      debugPrint('Delist error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delist: $e')),
        );
      }
    } finally {
      setState(() => _actionLoading = false);
    }
  }

  Future<void> _buy() async {
    setState(() => _actionLoading = true);

    try {
      final wallet = context.read<WalletProvider>();

      // Step 1: Call backend to prepare purchase (backend handles all logic)
      final api = ApiService(authToken: wallet.authToken);
      final prepareResult = await api.preparePurchase(
        tokenId: widget.tokenId,
      );

      if (prepareResult['success'] != true) {
        throw Exception(prepareResult['error'] ?? 'Failed to prepare purchase');
      }

      // Step 2: Sign the typed data via wallet service
      final typedData = prepareResult['typedData'] as Map<String, dynamic>;
      final contractCall = prepareResult['contractCall'] as Map<String, dynamic>;

      final signature = await wallet.signTypedData(typedData);

      // Step 3: Submit transaction via wallet service
      final contractService = await ContractService.getInstance();
      final contractAddress = contractService.contractAddress;

      // Build transaction data for buy() call
      final txData = _encodeBuyCall(
        tokenId: contractCall['params']['tokenId'] as int,
        signature: signature,
      );

      final txResult = await wallet.sendTransaction(
        to: contractAddress,
        data: txData,
        value: contractCall['value'] as String,
      );

      debugPrint('Buy transaction hash: ${txResult.hash}');

      // Sync backend with blockchain state so galleries reflect new ownership
      await ApiService().syncGallery();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Purchase successful! Bilateral agreement recorded on-chain.')),
        );
      }

      await _loadToken(); // Refresh to show new owner
    } catch (e) {
      debugPrint('Buy error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to buy: $e')),
        );
      }
    } finally {
      setState(() => _actionLoading = false);
    }
  }

  // ABI encoding helpers

  /// Encode list(uint256,uint256,uint8,bytes32,uint256,bytes) call
  String _encodeListCall({
    required int tokenId,
    required BigInt price,
    required int licenseType,
    required String licenseHash,
    required BigInt expiry,
    required Uint8List signature,
  }) {
    // Function selector: list(uint256,uint256,uint8,bytes32,uint256,bytes)
    // keccak256("list(uint256,uint256,uint8,bytes32,uint256,bytes)")[0:4] = 0x69c6945f
    const selector = '0x69c6945f';

    // Encode fixed-size parameters
    final tokenIdHex = tokenId.toRadixString(16).padLeft(64, '0');
    final priceHex = price.toRadixString(16).padLeft(64, '0');
    final licenseTypeHex = licenseType.toRadixString(16).padLeft(64, '0');
    final licenseHashHex = licenseHash.replaceFirst('0x', '').padLeft(64, '0');
    final expiryHex = expiry.toRadixString(16).padLeft(64, '0');

    // Offset for dynamic bytes parameter (6 * 32 = 192 = 0xc0)
    final signatureOffset = 'c0'.padLeft(64, '0');

    // Signature length
    final signatureLengthHex = signature.length.toRadixString(16).padLeft(64, '0');

    // Signature data (padded to 32-byte boundary)
    final signatureHex = signature.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    final paddedLength = ((signature.length + 31) ~/ 32) * 64;
    final signatureDataHex = signatureHex.padRight(paddedLength, '0');

    return '$selector$tokenIdHex$priceHex$licenseTypeHex$licenseHashHex$expiryHex$signatureOffset$signatureLengthHex$signatureDataHex';
  }

  /// Encode delist(uint256) call
  String _encodeDelistCall({required int tokenId}) {
    // Function selector: delist(uint256)
    // keccak256("delist(uint256)")[0:4] = 0x964bc33f
    const selector = '0x964bc33f';
    final tokenIdHex = tokenId.toRadixString(16).padLeft(64, '0');
    return '$selector$tokenIdHex';
  }

  /// Encode buy(uint256,bytes) call
  String _encodeBuyCall({
    required int tokenId,
    required Uint8List signature,
  }) {
    // Function selector: buy(uint256,bytes)
    // keccak256("buy(uint256,bytes)")[0:4] = 0x82189551
    const selector = '0x82189551';

    // Token ID
    final tokenIdHex = tokenId.toRadixString(16).padLeft(64, '0');

    // Offset for dynamic bytes parameter (2 * 32 = 64 = 0x40)
    final signatureOffset = '40'.padLeft(64, '0');

    // Signature length
    final signatureLengthHex = signature.length.toRadixString(16).padLeft(64, '0');

    // Signature data (padded to 32-byte boundary)
    final signatureHex = signature.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    final paddedLength = ((signature.length + 31) ~/ 32) * 64;
    final signatureDataHex = signatureHex.padRight(paddedLength, '0');

    return '$selector$tokenIdHex$signatureOffset$signatureLengthHex$signatureDataHex';
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
