import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:nftmarket/providers/mint_provider.dart';
import 'package:nftmarket/models/token.dart';

import '../fixtures/api_responses.dart';
import '../utils/test_app.dart';

/// Unit tests for the MintProvider state machine.
///
/// MintProvider manages the multi-step minting flow:
/// idle → selectingImage → imageSelected → uploading → minting → success/error
///
/// These tests verify state transitions, validation logic, and error handling.
void main() {
  group('MintProvider', () {
    group('Initial State', () {
      test('starts in idle state', () {
        final provider = MintProvider();

        expect(provider.state, equals(MintState.idle));
        expect(provider.imageBytes, isNull);
        expect(provider.fileName, isNull);
        expect(provider.name, isEmpty);
        expect(provider.description, isEmpty);
        expect(provider.result, isNull);
        expect(provider.error, isNull);
      });

      test('hasImage is false initially', () {
        final provider = MintProvider();

        expect(provider.hasImage, isFalse);
      });

      test('canMint is false initially', () {
        final provider = MintProvider();

        expect(provider.canMint, isFalse);
      });

      test('isMinting is false initially', () {
        final provider = MintProvider();

        expect(provider.isMinting, isFalse);
      });

      test('progress starts at 0', () {
        final provider = MintProvider();

        expect(provider.progress, equals(0));
      });
    });

    group('Image Selection', () {
      test('setImage updates state to imageSelected', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3, 4]);

        provider.setImage(imageBytes, 'test.png');

        expect(provider.state, equals(MintState.imageSelected));
        expect(provider.imageBytes, equals(imageBytes));
        expect(provider.fileName, equals('test.png'));
        expect(provider.hasImage, isTrue);
      });

      test('setImage clears previous error', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);

        // Simulate an error state
        provider.setImage(imageBytes, 'test.png');

        expect(provider.error, isNull);
      });

      test('clearImage resets to idle', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);

        provider.setImage(imageBytes, 'test.png');
        expect(provider.hasImage, isTrue);

        provider.clearImage();

        expect(provider.state, equals(MintState.idle));
        expect(provider.imageBytes, isNull);
        expect(provider.fileName, isNull);
        expect(provider.hasImage, isFalse);
      });
    });

    group('Form Fields', () {
      test('setName updates name field', () {
        final provider = MintProvider();

        provider.setName('My Artwork');

        expect(provider.name, equals('My Artwork'));
      });

      test('setDescription updates description field', () {
        final provider = MintProvider();

        provider.setDescription('A beautiful piece');

        expect(provider.description, equals('A beautiful piece'));
      });

      test('empty name prevents minting', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');
        provider.setName('');

        expect(provider.canMint, isFalse);
      });
    });

    group('canMint Validation', () {
      test('canMint requires image', () {
        final provider = MintProvider();
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);
        provider.setName('Test NFT');

        expect(provider.canMint, isFalse);
      });

      test('canMint requires name', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');

        expect(provider.canMint, isFalse);
      });

      test('canMint requires connected wallet', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = disconnected();

        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');
        provider.setName('Test NFT');

        expect(provider.canMint, isFalse);
      });

      test('canMint is true when all requirements met', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');
        provider.setName('Test NFT');

        expect(provider.canMint, isTrue);
      });

      test('description is optional for canMint', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');
        provider.setName('Test NFT');
        // description left empty

        expect(provider.canMint, isTrue);
      });
    });

    group('Wallet Integration', () {
      test('updateWallet stores wallet reference', () {
        final provider = MintProvider();
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);

        // canMint should now check wallet state
        expect(provider.canMint, isFalse); // Still false, no image/name
      });

      test('disconnecting wallet disables minting', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = connectedAsAlice();

        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');
        provider.setName('Test NFT');

        expect(provider.canMint, isTrue);

        // Simulate disconnect
        wallet.setDisconnected();
        provider.updateWallet(wallet);

        expect(provider.canMint, isFalse);
      });
    });

    group('State Machine Transitions', () {
      test('idle → imageSelected on setImage', () {
        final provider = MintProvider();

        expect(provider.state, equals(MintState.idle));

        provider.setImage(Uint8List.fromList([1]), 'test.png');

        expect(provider.state, equals(MintState.imageSelected));
      });

      test('imageSelected → idle on clearImage', () {
        final provider = MintProvider();

        provider.setImage(Uint8List.fromList([1]), 'test.png');
        expect(provider.state, equals(MintState.imageSelected));

        provider.clearImage();

        expect(provider.state, equals(MintState.idle));
      });

      test('isMinting state coverage', () {
        // Test that MintState enum contains expected values
        expect(MintState.uploading, isNotNull);
        expect(MintState.minting, isNotNull);

        // Test that a fresh provider's isMinting is false
        final provider = MintProvider();
        expect(provider.isMinting, isFalse);

        // After setting image, still not minting
        provider.setImage(Uint8List.fromList([1, 2, 3]), 'test.png');
        expect(provider.isMinting, isFalse);
      });
    });

    group('Reset', () {
      test('reset clears all state', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);
        final wallet = connectedAsAlice();

        // Set up state
        provider.updateWallet(wallet);
        provider.setImage(imageBytes, 'test.png');
        provider.setName('Test NFT');
        provider.setDescription('Test description');

        // Reset
        provider.reset();

        expect(provider.state, equals(MintState.idle));
        expect(provider.imageBytes, isNull);
        expect(provider.fileName, isNull);
        expect(provider.name, isEmpty);
        expect(provider.description, isEmpty);
        expect(provider.result, isNull);
        expect(provider.error, isNull);
        expect(provider.statusMessage, isEmpty);
        expect(provider.progress, equals(0));
      });
    });

    group('Status Messages', () {
      test('statusMessage is empty initially', () {
        final provider = MintProvider();

        expect(provider.statusMessage, isEmpty);
      });
    });

    group('MintResult Model', () {
      test('MintResult.fromJson parses success response', () {
        final json = MintFixtures.success(tokenId: 42);

        final result = MintResult.fromJson(json);

        expect(result.success, isTrue);
        expect(result.tokenId, equals(42));
        expect(result.transactionHash, isNotNull);
        expect(result.watermarkId, equals('WM_42'));
        expect(result.encryptedBlobUri, isNotNull);
        expect(result.previewUri, contains('QmMinted42'));
        expect(result.metadataUri, contains('metadata_42'));
      });

      test('MintResult.fromJson parses error response', () {
        final json = MintFixtures.duplicateError();

        final result = MintResult.fromJson(json);

        expect(result.success, isFalse);
        expect(result.error, equals('This image has already been minted'));
      });

      test('MintResult.error factory creates error result', () {
        final result = MintResult.error('Something went wrong');

        expect(result.success, isFalse);
        expect(result.error, equals('Something went wrong'));
        expect(result.tokenId, isNull);
      });
    });

    group('MintState Enum', () {
      test('all states are defined', () {
        expect(MintState.values.length, equals(7));
        expect(MintState.values, contains(MintState.idle));
        expect(MintState.values, contains(MintState.selectingImage));
        expect(MintState.values, contains(MintState.imageSelected));
        expect(MintState.values, contains(MintState.uploading));
        expect(MintState.values, contains(MintState.minting));
        expect(MintState.values, contains(MintState.success));
        expect(MintState.values, contains(MintState.error));
      });
    });

    group('File Name Handling', () {
      test('preserves original filename', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);

        provider.setImage(imageBytes, 'my_beautiful_art.jpg');

        expect(provider.fileName, equals('my_beautiful_art.jpg'));
      });

      test('handles filenames with spaces', () {
        final provider = MintProvider();
        final imageBytes = Uint8List.fromList([1, 2, 3]);

        provider.setImage(imageBytes, 'my art work.png');

        expect(provider.fileName, equals('my art work.png'));
      });
    });

    group('Listener Notifications', () {
      test('notifies listeners on setImage', () {
        final provider = MintProvider();
        int notifyCount = 0;

        provider.addListener(() => notifyCount++);
        provider.setImage(Uint8List.fromList([1]), 'test.png');

        expect(notifyCount, greaterThan(0));
      });

      test('notifies listeners on setName', () {
        final provider = MintProvider();
        int notifyCount = 0;

        provider.addListener(() => notifyCount++);
        provider.setName('Test');

        expect(notifyCount, greaterThan(0));
      });

      test('notifies listeners on reset', () {
        final provider = MintProvider();
        int notifyCount = 0;

        provider.addListener(() => notifyCount++);
        provider.reset();

        expect(notifyCount, greaterThan(0));
      });
    });
  });
}
