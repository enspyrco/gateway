import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:typed_data';

import '../services/api_service.dart';
import '../widgets/wallet_button.dart';

/// Blind watermark detection page.
///
/// Upload any image to check if it contains an NFTmarket watermark.
/// The detector extracts the embedded wallet:tokenId directly from the image.
class DetectPage extends StatefulWidget {
  const DetectPage({super.key});

  @override
  State<DetectPage> createState() => _DetectPageState();
}

class _DetectPageState extends State<DetectPage> {
  Uint8List? _imageBytes;
  String? _imageName;

  BlindDetectionResult? _result;
  bool _detecting = false;
  String? _detectError;

  Future<void> _pickImage() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: false,
      withData: true,
    );

    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      if (file.bytes != null) {
        setState(() {
          _imageBytes = file.bytes;
          _imageName = file.name;
          _result = null;
          _detectError = null;
        });
      }
    }
  }

  Future<void> _detect() async {
    if (_imageBytes == null) return;

    setState(() {
      _detecting = true;
      _detectError = null;
      _result = null;
    });

    try {
      final api = ApiService();
      final result = await api.detectBlind(
        imageBytes: _imageBytes!,
        fileName: _imageName ?? 'image.png',
      );
      setState(() {
        _result = result;
        _detecting = false;
      });
    } catch (e) {
      setState(() {
        _detectError = e.toString();
        _detecting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Watermark Detection'),
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
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 800),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildInstructions(),
                  const SizedBox(height: 24),
                  _buildImageUploader(),
                  if (_imageBytes != null) ...[
                    const SizedBox(height: 24),
                    _buildDetectButton(),
                  ],
                  if (_detectError != null) ...[
                    const SizedBox(height: 16),
                    _buildError(),
                  ],
                  if (_result != null) ...[
                    const SizedBox(height: 24),
                    _buildResult(),
                  ],
                  const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInstructions() {
    return Card(
      color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.05),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.search,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  'Blind Watermark Detection',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Upload any image to check if it contains an NFTmarket watermark. '
              'If found, the detector will identify the original creator and token. '
              'This works even if you don\'t know which token the image belongs to.',
              style: TextStyle(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Use cases:',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.grey.shade800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildUseCase(Icons.search, 'Identify the owner of an image'),
                  _buildUseCase(
                      Icons.gavel, 'Prove copyright for DMCA takedowns'),
                  _buildUseCase(Icons.warning, 'Detect unauthorized usage'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUseCase(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey.shade600),
          const SizedBox(width: 8),
          Text(text,
              style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildImageUploader() {
    return Card(
      child: InkWell(
        onTap: _detecting ? null : _pickImage,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: _imageBytes != null ? 300 : 200,
          padding: const EdgeInsets.all(24),
          child: _imageBytes != null
              ? Stack(
                  children: [
                    Center(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.memory(
                          _imageBytes!,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    Positioned(
                      top: 8,
                      right: 8,
                      child: IconButton.filled(
                        onPressed: _detecting
                            ? null
                            : () {
                                setState(() {
                                  _imageBytes = null;
                                  _imageName = null;
                                  _result = null;
                                });
                              },
                        icon: const Icon(Icons.close),
                        style: IconButton.styleFrom(
                          backgroundColor: Colors.black54,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          _imageName ?? 'Image',
                          style: const TextStyle(
                              color: Colors.white, fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                )
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.upload_file,
                      size: 48,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Upload image to analyze',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Supports PNG, JPEG, and other common formats',
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildDetectButton() {
    if (_detecting) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(
                'Analyzing image...',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Running frequency-domain watermark detection',
                style: TextStyle(color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      );
    }

    return ElevatedButton.icon(
      onPressed: _detect,
      icon: const Icon(Icons.search),
      label: const Text('Detect Watermark'),
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 16),
      ),
    );
  }

  Widget _buildError() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.error_outline, color: Colors.red.shade700),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _detectError!,
                  style: TextStyle(color: Colors.red.shade700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: () {
                  setState(() {
                    _detectError = null;
                  });
                },
                icon: const Icon(Icons.close, size: 18),
                label: const Text('Dismiss'),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.red.shade700,
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                onPressed: _detect,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red.shade600,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildResult() {
    final result = _result!;

    if (!result.detected) {
      return _buildNoWatermarkFound();
    }

    return _buildWatermarkFound(result);
  }

  Widget _buildNoWatermarkFound() {
    return Card(
      color: Colors.orange.shade50,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(
              Icons.search_off,
              size: 64,
              color: Colors.orange.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'No Watermark Detected',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.orange.shade700,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'This image does not appear to contain an NFTmarket watermark.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.orange.shade600),
            ),
            const SizedBox(height: 16),
            Text(
              'Possible reasons:',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.orange.shade700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '- Image was not minted on NFTmarket\n'
              '- Watermark was removed by heavy editing\n'
              '- Image was resized significantly\n'
              '- Low quality or compressed version',
              style: TextStyle(color: Colors.orange.shade600, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWatermarkFound(BlindDetectionResult result) {
    return Card(
      color: Colors.green.shade50,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(
              Icons.verified,
              size: 64,
              color: Colors.green.shade500,
            ),
            const SizedBox(height: 16),
            Text(
              'Watermark Detected!',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.green.shade700,
                  ),
            ),
            const SizedBox(height: 16),
            _buildConfidenceBar(result.confidence),
            const SizedBox(height: 24),

            // Token info
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildInfoRow('Token ID', '#${result.tokenId}'),
                  const SizedBox(height: 8),
                  _buildInfoRow(
                      'Creator', _truncateAddress(result.wallet ?? '')),
                  if (result.token != null) ...[
                    const SizedBox(height: 8),
                    _buildInfoRow('Current Owner',
                        _truncateAddress(result.token!.currentOwner)),
                    const SizedBox(height: 8),
                    _buildInfoRow(
                        'License', _formatLicense(result.token!.licenseType)),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Stats row
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildStatChip(
                    'Confidence', result.confidence.toStringAsFixed(1)),
                const SizedBox(width: 12),
                _buildStatChip('Sequences', result.sequencesDecoded.toString()),
              ],
            ),

            const SizedBox(height: 24),

            // Action buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: () => context.go('/token/${result.tokenId}'),
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('View Token'),
                ),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  onPressed: () => context.go('/verify/${result.tokenId}'),
                  icon: const Icon(Icons.verified_user),
                  label: const Text('Verify'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfidenceBar(double confidence) {
    // Normalize confidence (typically 6-12 range from Legendre detector)
    final normalizedConfidence = (confidence / 12.0).clamp(0.0, 1.0);

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Detection Confidence'),
            Text(confidence.toStringAsFixed(1)),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: normalizedConfidence,
            minHeight: 8,
            backgroundColor: Colors.grey.shade200,
            valueColor: AlwaysStoppedAnimation(
              confidence > 8.0
                  ? Colors.green
                  : confidence > 6.0
                      ? Colors.orange
                      : Colors.red,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          confidence > 8.0
              ? 'High confidence match'
              : confidence > 6.0
                  ? 'Moderate confidence match'
                  : 'Low confidence match',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade600,
          ),
        ),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(color: Colors.grey.shade600),
        ),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _buildStatChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  String _truncateAddress(String address) {
    if (address.length <= 12) return address;
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }

  String _formatLicense(String licenseType) {
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
}
