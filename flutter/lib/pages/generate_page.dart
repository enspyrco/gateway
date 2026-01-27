import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../services/api_service.dart';
import '../providers/wallet_provider.dart';
import '../widgets/wallet_button.dart';

class GeneratePage extends StatefulWidget {
  const GeneratePage({super.key});

  @override
  State<GeneratePage> createState() => _GeneratePageState();
}

class _GeneratePageState extends State<GeneratePage> {
  final _promptController = TextEditingController();
  List<Map<String, dynamic>> _styles = [];
  String _selectedStyle = 'photographic';
  bool _loadingStyles = true;
  bool _generating = false;
  GenerationResult? _result;
  String? _error;
  int? _selectedImageIndex;

  @override
  void initState() {
    super.initState();
    _loadStyles();
  }

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  Future<void> _loadStyles() async {
    try {
      final api = ApiService();
      final styles = await api.getGenerationStyles();
      setState(() {
        _styles = styles;
        _loadingStyles = false;
      });
    } catch (e) {
      setState(() {
        _loadingStyles = false;
        _error = 'Failed to load styles: $e';
      });
    }
  }

  Future<void> _generate() async {
    final prompt = _promptController.text.trim();
    if (prompt.isEmpty) {
      setState(() => _error = 'Please enter a prompt');
      return;
    }

    final wallet = context.read<WalletProvider>();
    if (!wallet.isConnected) {
      setState(() => _error = 'Please connect your wallet first');
      return;
    }

    setState(() {
      _generating = true;
      _error = null;
      _result = null;
      _selectedImageIndex = null;
    });

    try {
      final api = ApiService(authToken: wallet.authToken);
      final result = await api.generate(
        prompt: prompt,
        style: _selectedStyle,
        count: 4,
      );

      setState(() {
        _result = result;
        _generating = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _generating = false;
      });
    }
  }

  void _selectImage(int index) {
    setState(() {
      _selectedImageIndex = _selectedImageIndex == index ? null : index;
    });
  }

  void _mintSelected() {
    if (_selectedImageIndex == null || _result == null) return;

    final image = _result!.images[_selectedImageIndex!];
    final api = ApiService();

    // Navigate to mint page with the generated image URL
    context.go('/mint', extra: {
      'generatedImageUrl': api.getGeneratedImageUrl(image.url),
      'prompt': _result!.prompt,
      'style': _result!.style,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Generate AI Art'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        actions: const [
          WalletButton(),
          SizedBox(width: 16),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 800),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildPromptSection(),
                const SizedBox(height: 24),
                _buildStyleSection(),
                const SizedBox(height: 24),
                _buildGenerateButton(),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  _buildError(),
                ],
                if (_generating) ...[
                  const SizedBox(height: 32),
                  _buildLoadingIndicator(),
                ],
                if (_result != null && !_generating) ...[
                  const SizedBox(height: 32),
                  _buildResults(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPromptSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Describe your artwork',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _promptController,
          maxLines: 3,
          maxLength: 1000,
          decoration: const InputDecoration(
            hintText:
                'A serene mountain landscape at sunset with golden light reflecting off a crystal clear lake...',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (_) => _generate(),
        ),
      ],
    );
  }

  Widget _buildStyleSection() {
    if (_loadingStyles) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Style',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _styles.map((style) {
            final id = style['id'] as String;
            final name = style['name'] as String;
            final isSelected = _selectedStyle == id;

            return ChoiceChip(
              label: Text(name),
              selected: isSelected,
              onSelected: (selected) {
                if (selected) {
                  setState(() => _selectedStyle = id);
                }
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildGenerateButton() {
    final wallet = context.watch<WalletProvider>();

    return SizedBox(
      height: 48,
      child: ElevatedButton.icon(
        onPressed: _generating ? null : _generate,
        icon: const Icon(Icons.auto_awesome),
        label: Text(
            wallet.isConnected ? 'Generate' : 'Connect Wallet to Generate'),
        style: ElevatedButton.styleFrom(
          backgroundColor: Theme.of(context).colorScheme.primary,
          foregroundColor: Theme.of(context).colorScheme.onPrimary,
        ),
      ),
    );
  }

  Widget _buildError() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade700),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _error!,
              style: TextStyle(color: Colors.red.shade700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingIndicator() {
    return Column(
      children: [
        const CircularProgressIndicator(),
        const SizedBox(height: 16),
        Text(
          'Creating your artwork...',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
        const SizedBox(height: 8),
        Text(
          'This may take a moment',
          style: TextStyle(color: Colors.grey.shade600),
        ),
      ],
    );
  }

  Widget _buildResults() {
    final api = ApiService();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Generated Images',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (_selectedImageIndex != null)
              ElevatedButton.icon(
                onPressed: _mintSelected,
                icon: const Icon(Icons.token),
                label: const Text('Mint Selected'),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Select an image to mint as an NFT',
          style: TextStyle(color: Colors.grey.shade600),
        ),
        const SizedBox(height: 16),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
          ),
          itemCount: _result!.images.length,
          itemBuilder: (context, index) {
            final image = _result!.images[index];
            final isSelected = _selectedImageIndex == index;
            final imageUrl = api.getGeneratedImageUrl(image.url);

            return GestureDetector(
              onTap: () => _selectImage(index),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected
                        ? Theme.of(context).colorScheme.primary
                        : Colors.grey.shade300,
                    width: isSelected ? 3 : 1,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return Center(
                            child: CircularProgressIndicator(
                              value: loadingProgress.expectedTotalBytes != null
                                  ? loadingProgress.cumulativeBytesLoaded /
                                      loadingProgress.expectedTotalBytes!
                                  : null,
                            ),
                          );
                        },
                        errorBuilder: (_, __, ___) => Container(
                          color: Colors.grey.shade200,
                          child: const Icon(Icons.broken_image, size: 48),
                        ),
                      ),
                      if (isSelected)
                        Positioned(
                          top: 8,
                          right: 8,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.primary,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              Icons.check,
                              color: Theme.of(context).colorScheme.onPrimary,
                              size: 20,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 24),
        Center(
          child: TextButton.icon(
            onPressed: _generate,
            icon: const Icon(Icons.refresh),
            label: const Text('Generate More'),
          ),
        ),
      ],
    );
  }
}
