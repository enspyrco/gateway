/// Pre-built JSON responses for all API endpoints.
///
/// These fixtures provide consistent, realistic test data that matches
/// the actual API responses from the NFTmarket backend.
library;

/// Test wallet addresses (matching wallet_provider.dart)
class TestAddresses {
  static const alice = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  static const bob = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
  static const sam = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
  static const joe = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
  static const mary = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
  static const platform = '0x70997970C51812dc3A010C7d01b50e44D9c4F5Ee';
}

/// Sample token data for testing
class TokenFixtures {
  static Map<String, dynamic> token({
    int tokenId = 1,
    String name = 'Test NFT',
    String description = 'A beautiful test artwork',
    String? previewUrl,
    String creator = TestAddresses.alice,
    String currentOwner = TestAddresses.alice,
    DateTime? mintedAt,
    String? watermarkId,
    String? transactionHash,
  }) {
    return {
      'tokenId': tokenId,
      'name': name,
      'description': description,
      'imageUrl': previewUrl ?? 'https://ipfs.io/ipfs/QmTest$tokenId',
      'previewUrl': previewUrl ?? 'https://ipfs.io/ipfs/QmTest$tokenId',
      'creator': creator,
      'currentOwner': currentOwner,
      'mintedAt': (mintedAt ?? DateTime(2024, 1, 15)).toIso8601String(),
      'watermarkId': watermarkId ?? 'WM_$tokenId',
      'transactionHash':
          transactionHash ?? '0x${tokenId.toRadixString(16).padLeft(64, '0')}',
    };
  }

  static Map<String, dynamic> tokenOwnedByBob({int tokenId = 2}) {
    return token(
      tokenId: tokenId,
      name: 'Bob\'s Artwork',
      creator: TestAddresses.bob,
      currentOwner: TestAddresses.bob,
    );
  }

  static Map<String, dynamic> tokenWithLicense({
    int tokenId = 3,
    String creator = TestAddresses.alice,
    String currentOwner = TestAddresses.bob,
    String ownerLicense = 'display',
    bool isOriginal = false,
  }) {
    return {
      ...token(tokenId: tokenId, creator: creator, currentOwner: currentOwner),
      'ownerLicense': ownerLicense,
      'isOriginal': isOriginal,
      'copyrightOwner': creator,
    };
  }
}

/// Sample listing data for marketplace testing
class ListingFixtures {
  static Map<String, dynamic> listing({
    int tokenId = 1,
    String name = 'Test NFT',
    String seller = TestAddresses.alice,
    String priceEth = '1.5',
    String licenseType = 'display',
    bool listed = true,
  }) {
    return {
      'tokenId': tokenId,
      'name': name,
      'seller': seller,
      'priceEth': priceEth,
      'licenseType': licenseType,
      'listed': listed,
      'imageUrl': 'https://ipfs.io/ipfs/QmTest$tokenId',
      'previewUrl': 'https://ipfs.io/ipfs/QmTest$tokenId',
    };
  }

  static Map<String, dynamic> displayListing({int tokenId = 1}) {
    return listing(
      tokenId: tokenId,
      priceEth: '0.5',
      licenseType: 'display',
    );
  }

  static Map<String, dynamic> commercialListing({int tokenId = 2}) {
    return listing(
      tokenId: tokenId,
      name: 'Commercial Art',
      priceEth: '2.0',
      licenseType: 'commercial',
    );
  }

  static Map<String, dynamic> transferListing({int tokenId = 3}) {
    return listing(
      tokenId: tokenId,
      name: 'Full Rights Art',
      priceEth: '10.0',
      licenseType: 'transfer',
    );
  }

  /// Multi-license listing (token with multiple active listings)
  static Map<String, dynamic> multiLicenseListing({int tokenId = 4}) {
    return {
      ...listing(tokenId: tokenId, name: 'Multi-License Art'),
      'listings': [
        {'licenseType': 'display', 'priceEth': '0.5'},
        {'licenseType': 'commercial', 'priceEth': '2.0'},
        {'licenseType': 'transfer', 'priceEth': '10.0'},
      ],
      'isListed': true,
    };
  }
}

/// License status responses for testing upgrade/downgrade logic
class LicenseStatusFixtures {
  /// User has no existing license - can buy any
  static Map<String, dynamic> noExistingLicense() {
    return {
      'existingLicense': null,
      'canBuy': {
        'display': true,
        'commercial': true,
        'transfer': true,
      },
    };
  }

  /// User has display license - can upgrade to commercial or transfer
  static Map<String, dynamic> hasDisplayLicense() {
    return {
      'existingLicense': 'display',
      'canBuy': {
        'display': false, // Already owns
        'commercial': true, // Can upgrade
        'transfer': true, // Can upgrade
      },
    };
  }

  /// User has commercial license - can only upgrade to transfer
  static Map<String, dynamic> hasCommercialLicense() {
    return {
      'existingLicense': 'commercial',
      'canBuy': {
        'display': false, // Cannot downgrade
        'commercial': false, // Already owns
        'transfer': true, // Can upgrade
      },
    };
  }

  /// User has transfer (full copyright) - cannot buy any more
  static Map<String, dynamic> hasTransferLicense() {
    return {
      'existingLicense': 'transfer',
      'canBuy': {
        'display': false, // Cannot downgrade
        'commercial': false, // Cannot downgrade
        'transfer': false, // Already owns
      },
    };
  }

  /// User is the copyright owner (original creator or transfer recipient)
  static Map<String, dynamic> isCopyrightOwner() {
    return {
      'existingLicense': 'copyright',
      'canBuy': {
        'display': false,
        'commercial': false,
        'transfer': false,
      },
    };
  }
}

/// Gallery API responses
class GalleryFixtures {
  static Map<String, dynamic> galleryList() {
    return {
      'galleries': [
        {
          'address': TestAddresses.alice,
          'tokenCount': 3,
          'previewTokenName': 'Sunset Dreams',
        },
        {
          'address': TestAddresses.bob,
          'tokenCount': 1,
          'previewTokenName': 'Digital Forest',
        },
        {
          'address': TestAddresses.sam,
          'tokenCount': 5,
          'previewTokenName': 'Abstract Thoughts',
        },
      ],
    };
  }

  static Map<String, dynamic> emptyGalleryList() {
    return {'galleries': []};
  }

  static Map<String, dynamic> galleryTokens({
    String owner = TestAddresses.alice,
    int count = 3,
  }) {
    return {
      'tokens': List.generate(
        count,
        (i) => TokenFixtures.token(
          tokenId: i + 1,
          name: 'Artwork #${i + 1}',
          currentOwner: owner,
          creator: owner,
        ),
      ),
    };
  }

  static Map<String, dynamic> emptyGallery() {
    return {'tokens': []};
  }

  /// Gallery with tokens that have active listings
  static Map<String, dynamic> galleryWithListedTokens() {
    return {
      'tokens': [
        {
          ...TokenFixtures.token(tokenId: 1, name: 'Listed Art'),
          'isListed': true,
          'listingLicenseType': 'display',
          'listings': [
            {'licenseType': 'display', 'priceEth': '0.5'},
          ],
        },
        {
          ...TokenFixtures.token(tokenId: 2, name: 'Multi-Listed Art'),
          'isListed': true,
          'listings': [
            {'licenseType': 'display', 'priceEth': '0.5'},
            {'licenseType': 'commercial', 'priceEth': '2.0'},
          ],
        },
        {
          ...TokenFixtures.token(tokenId: 3, name: 'Not Listed'),
          'isListed': false,
        },
      ],
    };
  }
}

/// Marketplace API responses
class MarketplaceFixtures {
  static Map<String, dynamic> listingsResponse({int count = 3}) {
    return {
      'listings': List.generate(
        count,
        (i) => ListingFixtures.listing(
          tokenId: i + 1,
          name: 'NFT #${i + 1}',
          priceEth: '${(i + 1) * 0.5}',
        ),
      ),
    };
  }

  static Map<String, dynamic> emptyListings() {
    return {'listings': []};
  }

  static Map<String, dynamic> mixedLicenseListings() {
    return {
      'listings': [
        ListingFixtures.displayListing(tokenId: 1),
        ListingFixtures.commercialListing(tokenId: 2),
        ListingFixtures.transferListing(tokenId: 3),
      ],
    };
  }

  static Map<String, dynamic> singleListing(int tokenId) {
    return ListingFixtures.listing(tokenId: tokenId);
  }

  static Map<String, dynamic> notListedToken(int tokenId) {
    return {
      'tokenId': tokenId,
      'listed': false,
    };
  }
}

/// EIP-712 domain for contract address retrieval
class ContractFixtures {
  static const defaultContractAddress =
      '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  static Map<String, dynamic> eip712Domain() {
    return {
      'domain': {
        'name': 'NFTmarket',
        'version': '1',
        'chainId': 31337,
        'verifyingContract': defaultContractAddress,
      },
    };
  }
}

/// Prepare listing/purchase responses
class TransactionFixtures {
  static Map<String, dynamic> prepareListingResponse() {
    return {
      'success': true,
      'typedData': {
        'domain': ContractFixtures.eip712Domain()['domain'],
        'primaryType': 'ListingAgreement',
        'types': {
          'EIP712Domain': [
            {'name': 'name', 'type': 'string'},
            {'name': 'version', 'type': 'string'},
            {'name': 'chainId', 'type': 'uint256'},
            {'name': 'verifyingContract', 'type': 'address'},
          ],
          'ListingAgreement': [
            {'name': 'tokenId', 'type': 'uint256'},
            {'name': 'price', 'type': 'uint256'},
            {'name': 'licenseType', 'type': 'uint8'},
          ],
        },
        'message': {
          'tokenId': 1,
          'price': '1500000000000000000',
          'licenseType': 0,
        },
      },
      'contractCall': {
        'method': 'list',
        'params': {
          'tokenId': 1,
          'price': '1500000000000000000',
          'licenseType': 0,
          'licenseHash':
              '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          'expiry': 1735689600,
        },
      },
    };
  }

  static Map<String, dynamic> preparePurchaseResponse() {
    return {
      'success': true,
      'typedData': {
        'domain': ContractFixtures.eip712Domain()['domain'],
        'primaryType': 'PurchaseAgreement',
        'types': {},
        'message': {
          'tokenId': 1,
          'licenseType': 'display',
        },
      },
    };
  }

  static Map<String, dynamic> encodeListResponse() {
    return {
      'txData': '0x1234abcd',
    };
  }

  static Map<String, dynamic> encodeBuyResponse() {
    return {
      'txData': '0x5678efgh',
      'value': '1500000000000000000',
    };
  }
}

/// AI Generation fixtures
class GenerationFixtures {
  static Map<String, dynamic> stylesResponse() {
    return {
      'styles': [
        {
          'id': 'photographic',
          'name': 'Photographic',
          'description': 'Photo-realistic images'
        },
        {
          'id': 'digital-art',
          'name': 'Digital Art',
          'description': 'Digital artwork style'
        },
        {'id': 'anime', 'name': 'Anime', 'description': 'Anime/manga style'},
      ],
    };
  }

  static Map<String, dynamic> generationSuccess() {
    return {
      'success': true,
      'generationId': 'gen-12345',
      'prompt': 'A beautiful sunset over mountains',
      'style': 'photographic',
      'images': [
        {
          'id': 'img-1',
          'seed': 12345,
          'url': '/api/generate/gen-12345/image/0'
        },
        {
          'id': 'img-2',
          'seed': 12346,
          'url': '/api/generate/gen-12345/image/1'
        },
        {
          'id': 'img-3',
          'seed': 12347,
          'url': '/api/generate/gen-12345/image/2'
        },
        {
          'id': 'img-4',
          'seed': 12348,
          'url': '/api/generate/gen-12345/image/3'
        },
      ],
    };
  }
}

/// Error response fixtures
class ErrorFixtures {
  static Map<String, dynamic> notFound(String message) {
    return {'error': message, 'code': 'NOT_FOUND'};
  }

  static Map<String, dynamic> unauthorized() {
    return {'error': 'Authentication required', 'code': 'UNAUTHORIZED'};
  }

  static Map<String, dynamic> forbidden(String message) {
    return {'error': message, 'code': 'FORBIDDEN'};
  }

  static Map<String, dynamic> serverError() {
    return {'error': 'Internal server error', 'code': 'INTERNAL_ERROR'};
  }

  static Map<String, dynamic> rateLimited() {
    return {
      'error': 'Rate limit exceeded. Try again in 1 hour.',
      'code': 'RATE_LIMITED',
    };
  }
}

/// Mint result fixtures
class MintFixtures {
  static Map<String, dynamic> success({int tokenId = 1}) {
    return {
      'success': true,
      'tokenId': tokenId,
      'transactionHash': '0x${tokenId.toRadixString(16).padLeft(64, 'a')}',
      'watermarkId': 'WM_$tokenId',
      'encryptedBlobUri': 'gs://nftmarket-storage/encrypted/$tokenId',
      'ipfsUri': 'https://ipfs.io/ipfs/QmMinted$tokenId',
      'metadataUri': 'ar://metadata_$tokenId',
    };
  }

  static Map<String, dynamic> duplicateError() {
    return {
      'success': false,
      'error': 'This image has already been minted',
      'code': 'DUPLICATE_IMAGE',
    };
  }
}
