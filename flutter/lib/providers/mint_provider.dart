import 'package:flutter/foundation.dart';

import '../models/token.dart';
import '../services/api_service.dart';
import 'wallet_provider.dart';

enum MintState {
  idle,
  selectingImage,
  imageSelected,
  uploading,
  minting,
  success,
  error,
}

class MintProvider extends ChangeNotifier {
  MintState _state = MintState.idle;
  WalletProvider? _wallet;

  // Form data
  Uint8List? _imageBytes;
  String? _fileName;
  String _name = '';
  String _description = '';

  // Result
  MintResult? _result;
  String? _error;

  // Progress
  String _statusMessage = '';
  double _progress = 0;

  // Getters
  MintState get state => _state;
  Uint8List? get imageBytes => _imageBytes;
  String? get fileName => _fileName;
  String get name => _name;
  String get description => _description;
  MintResult? get result => _result;
  String? get error => _error;
  String get statusMessage => _statusMessage;
  double get progress => _progress;

  bool get hasImage => _imageBytes != null;
  bool get canMint =>
      hasImage && _name.isNotEmpty && _wallet?.isConnected == true;
  bool get isMinting =>
      _state == MintState.uploading || _state == MintState.minting;

  ApiService get _api => ApiService(authToken: _wallet?.authToken);

  void updateWallet(WalletProvider wallet) {
    _wallet = wallet;
    notifyListeners();
  }

  void setImage(Uint8List bytes, String fileName) {
    _imageBytes = bytes;
    _fileName = fileName;
    _state = MintState.imageSelected;
    _error = null;
    notifyListeners();
  }

  void clearImage() {
    _imageBytes = null;
    _fileName = null;
    _state = MintState.idle;
    notifyListeners();
  }

  void setName(String value) {
    _name = value;
    notifyListeners();
  }

  void setDescription(String value) {
    _description = value;
    notifyListeners();
  }

  Future<void> mint() async {
    if (!canMint) return;

    try {
      // Step 1: Upload image
      _state = MintState.uploading;
      _statusMessage = 'Uploading image...';
      _progress = 0.2;
      notifyListeners();

      await Future.delayed(const Duration(milliseconds: 500));
      _statusMessage = 'Applying watermark...';
      _progress = 0.4;
      notifyListeners();

      await Future.delayed(const Duration(milliseconds: 500));
      _state = MintState.minting;
      _statusMessage = 'Minting NFT...';
      _progress = 0.7;
      notifyListeners();

      _result = await _api.mint(
        imageBytes: _imageBytes!,
        fileName: _fileName!,
        name: _name,
        description: _description,
      );

      if (_result!.success) {
        _state = MintState.success;
        _statusMessage = 'Success!';
        _progress = 1.0;
      } else {
        _state = MintState.error;
        _error = _result!.error ?? 'Minting failed';
        _statusMessage = 'Error';
      }
    } catch (e) {
      _state = MintState.error;
      _error = e.toString();
      _statusMessage = 'Error';
    }

    notifyListeners();
  }

  void reset() {
    _state = MintState.idle;
    _imageBytes = null;
    _fileName = null;
    _name = '';
    _description = '';
    _result = null;
    _error = null;
    _statusMessage = '';
    _progress = 0;
    notifyListeners();
  }
}
