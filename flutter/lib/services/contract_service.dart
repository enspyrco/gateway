import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:web3dart/web3dart.dart';

/// EIP-712 domain for typed data signing
class EIP712Domain {
  final String name;
  final String version;
  final int chainId;
  final String verifyingContract;

  EIP712Domain({
    required this.name,
    required this.version,
    required this.chainId,
    required this.verifyingContract,
  });

  factory EIP712Domain.fromJson(Map<String, dynamic> json) {
    return EIP712Domain(
      name: json['name'] as String,
      version: json['version'] as String,
      chainId: json['chainId'] as int,
      verifyingContract: json['verifyingContract'] as String,
    );
  }
}

/// Service for direct smart contract interactions (read-only)
/// Transaction submission is handled by the wallet service
class ContractService {
  static ContractService? _instance;
  late Web3Client _client;
  late DeployedContract _contract;
  late String _rpcUrl;
  late String _contractAddress;
  late EIP712Domain _domain;

  ContractService._();

  static Future<ContractService> getInstance() async {
    if (_instance == null) {
      _instance = ContractService._();
      await _instance!._initialize();
    }
    return _instance!;
  }

  Future<void> _initialize() async {
    // Use localhost in debug mode, Polygon in production
    _rpcUrl = kDebugMode ? 'http://localhost:8545' : 'https://polygon-rpc.com';

    const backendUrl = kDebugMode
        ? 'http://localhost:3000'
        : String.fromEnvironment('BACKEND_URL');

    // Fetch EIP-712 domain from backend to get the correct contract address
    try {
      final response = await http.get(
        Uri.parse('$backendUrl/api/marketplace/eip712/domain'),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final domainData = data['domain'] as Map<String, dynamic>;
        _domain = EIP712Domain.fromJson(domainData);
        _contractAddress = _domain.verifyingContract;
        debugPrint('[ContractService] Fetched domain from backend');
      } else {
        throw Exception('Failed to fetch domain: ${response.statusCode}');
      }
    } catch (e) {
      // Fallback to compile-time constant if backend is unavailable
      debugPrint('[ContractService] Could not fetch domain from backend: $e');
      _contractAddress = kDebugMode
          ? const String.fromEnvironment('CONTRACT_ADDRESS',
              defaultValue: '0x5FbDB2315678afecb367f032d93F642f64180aa3')
          : const String.fromEnvironment('CONTRACT_ADDRESS');
      _domain = EIP712Domain(
        name: 'NFTmarket',
        version: '1',
        chainId: kDebugMode ? 31337 : 137,
        verifyingContract: _contractAddress,
      );
    }

    _client = Web3Client(_rpcUrl, http.Client());

    // ABI for marketplace functions (read-only)
    const abi = '''[
      {
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "getListing",
        "outputs": [
          {"name": "seller", "type": "address"},
          {"name": "price", "type": "uint256"},
          {"name": "licenseType", "type": "uint8"},
          {"name": "licenseHash", "type": "bytes32"},
          {"name": "nonce", "type": "uint256"},
          {"name": "expiry", "type": "uint256"},
          {"name": "active", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "getNonce",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "getMaxSellableLicense",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {"name": "tokenId", "type": "uint256"},
          {"name": "account", "type": "address"}
        ],
        "name": "checkDisplayRights",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {"name": "tokenId", "type": "uint256"},
          {"name": "account", "type": "address"}
        ],
        "name": "checkCommercialRights",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {"name": "tokenId", "type": "uint256"},
          {"name": "account", "type": "address"}
        ],
        "name": "checkCopyrightOwnership",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
      }
    ]''';

    _contract = DeployedContract(
      ContractAbi.fromJson(abi, 'NFTmarketNFT'),
      EthereumAddress.fromHex(_contractAddress),
    );

    debugPrint('[ContractService] Initialized with RPC: $_rpcUrl');
    debugPrint('[ContractService] Contract: $_contractAddress');
  }

  /// Get the EIP-712 domain
  EIP712Domain get domain => _domain;

  /// Get the contract address
  String get contractAddress => _contractAddress;

  /// Get current nonce for an address
  Future<BigInt> getNonce(String address) async {
    final function = _contract.function('getNonce');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [EthereumAddress.fromHex(address)],
    );

    return result[0] as BigInt;
  }

  /// Get listing info for a token
  Future<Map<String, dynamic>> getListing(int tokenId) async {
    final function = _contract.function('getListing');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [BigInt.from(tokenId)],
    );

    return {
      'seller': (result[0] as EthereumAddress).hex,
      'price': (result[1] as BigInt).toString(),
      'priceEth': (result[1] as BigInt) / BigInt.from(10).pow(18),
      'licenseType': (result[2] as BigInt).toInt(),
      'licenseHash': _bytesToHex(result[3] as List<int>),
      'nonce': (result[4] as BigInt),
      'expiry': (result[5] as BigInt),
      'active': result[6] as bool,
    };
  }

  /// Get owner of a token
  Future<String> ownerOf(int tokenId) async {
    final function = _contract.function('ownerOf');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [BigInt.from(tokenId)],
    );

    return (result[0] as EthereumAddress).hex;
  }

  /// Get the maximum license type the current owner can sell
  /// Returns 0=Display, 1=Commercial, 2=Transfer
  Future<int> getMaxSellableLicense(int tokenId) async {
    final function = _contract.function('getMaxSellableLicense');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [BigInt.from(tokenId)],
    );

    return (result[0] as BigInt).toInt();
  }

  /// Check if an address has Display rights for a token
  Future<bool> checkDisplayRights(int tokenId, String address) async {
    final function = _contract.function('checkDisplayRights');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [BigInt.from(tokenId), EthereumAddress.fromHex(address)],
    );

    return result[0] as bool;
  }

  /// Check if an address has Commercial rights for a token
  Future<bool> checkCommercialRights(int tokenId, String address) async {
    final function = _contract.function('checkCommercialRights');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [BigInt.from(tokenId), EthereumAddress.fromHex(address)],
    );

    return result[0] as bool;
  }

  /// Check if an address owns the copyright for a token
  Future<bool> checkCopyrightOwnership(int tokenId, String address) async {
    final function = _contract.function('checkCopyrightOwnership');

    final result = await _client.call(
      contract: _contract,
      function: function,
      params: [BigInt.from(tokenId), EthereumAddress.fromHex(address)],
    );

    return result[0] as bool;
  }

  /// Convert bytes to hex string
  String _bytesToHex(List<int> bytes) {
    return '0x${bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
  }

  void dispose() {
    _client.dispose();
  }
}
