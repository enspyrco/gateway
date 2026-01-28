// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {NFTLicensingSystem} from "../src/NFTLicensingSystem.sol";
import {INFTLicensing} from "../src/interfaces/INFTLicensing.sol";
import {TokenIdCodec} from "../src/libraries/TokenIdCodec.sol";

contract NFTLicensingSystemTest is Test {
    NFTLicensingSystem public nft;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    event ArtworkCreated(uint160 indexed artworkId, address indexed originalMinter, string metadataURI);
    event LicenseMinted(
        uint256 indexed tokenId,
        uint160 indexed artworkId,
        INFTLicensing.LicenseType licenseType,
        address indexed to,
        uint88 instanceId
    );
    event CopyrightTransferred(
        uint160 indexed artworkId,
        address indexed from,
        address indexed to,
        INFTLicensing.RetentionType retention
    );

    function setUp() public {
        nft = new NFTLicensingSystem();
    }

    // ============ TokenIdCodec Tests ============

    function test_TokenIdCodec_EncodeDecode() public pure {
        uint160 artworkId = 12345;
        uint8 licenseType = 1;
        uint88 instanceId = 999;

        uint256 tokenId = TokenIdCodec.encode(artworkId, licenseType, instanceId);

        (uint160 decodedArtworkId, uint8 decodedLicenseType, uint88 decodedInstanceId) =
            TokenIdCodec.decode(tokenId);

        assertEq(decodedArtworkId, artworkId);
        assertEq(decodedLicenseType, licenseType);
        assertEq(decodedInstanceId, instanceId);
    }

    function test_TokenIdCodec_Getters() public pure {
        uint160 artworkId = type(uint160).max - 12345;
        uint8 licenseType = 2;
        uint88 instanceId = type(uint88).max;

        uint256 tokenId = TokenIdCodec.encode(artworkId, licenseType, instanceId);

        assertEq(TokenIdCodec.getArtworkId(tokenId), artworkId);
        assertEq(TokenIdCodec.getLicenseType(tokenId), licenseType);
        assertEq(TokenIdCodec.getInstanceId(tokenId), instanceId);
    }

    function test_TokenIdCodec_CopyrightTokenId() public pure {
        uint160 artworkId = 42;
        uint256 copyrightId = TokenIdCodec.copyrightTokenId(artworkId);

        assertEq(TokenIdCodec.getArtworkId(copyrightId), artworkId);
        assertEq(TokenIdCodec.getLicenseType(copyrightId), 0);
        assertEq(TokenIdCodec.getInstanceId(copyrightId), 0);
    }

    // ============ createArtwork Tests ============

    function test_CreateArtwork() public {
        vm.startPrank(alice);

        vm.expectEmit(true, true, false, true);
        emit ArtworkCreated(1, alice, "ipfs://test");

        uint160 artworkId = nft.createArtwork("ipfs://test");
        vm.stopPrank();

        assertEq(artworkId, 1);

        INFTLicensing.Artwork memory artwork = nft.getArtwork(artworkId);
        assertEq(artwork.originalMinter, alice);
        assertEq(artwork.commercialCount, 0);
        assertEq(artwork.displayCount, 0);
        assertFalse(artwork.copyrightTransferred);
        assertEq(artwork.metadataURI, "ipfs://test");

        // Verify copyright token minted
        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);
        assertEq(nft.ownerOf(copyrightTokenId), alice);

        INFTLicensing.LicenseInfo memory license = nft.getLicenseInfo(copyrightTokenId);
        assertEq(license.artworkId, artworkId);
        assertEq(uint8(license.licenseType), uint8(INFTLicensing.LicenseType.Copyright));
        assertTrue(license.isOriginalGrant);
        assertEq(license.instanceId, 0);
    }

    function test_CreateMultipleArtworks() public {
        vm.startPrank(alice);
        uint160 id1 = nft.createArtwork("ipfs://1");
        uint160 id2 = nft.createArtwork("ipfs://2");
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);

        assertEq(nft.getArtwork(id1).metadataURI, "ipfs://1");
        assertEq(nft.getArtwork(id2).metadataURI, "ipfs://2");
    }

    function test_WatermarkPersists() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        // Verify watermark
        assertEq(nft.getOriginalMinter(artworkId), alice);

        // Transfer copyright to bob
        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);
        vm.prank(alice);
        nft.transferFrom(alice, bob, copyrightTokenId);

        // Watermark should still be alice
        assertEq(nft.getOriginalMinter(artworkId), alice);
        assertEq(nft.ownerOf(copyrightTokenId), bob);
    }

    // ============ mintLicense Tests ============

    function test_MintCommercialLicense() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        uint256 tokenId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, bob);

        assertEq(nft.ownerOf(tokenId), bob);

        INFTLicensing.LicenseInfo memory license = nft.getLicenseInfo(tokenId);
        assertEq(license.artworkId, artworkId);
        assertEq(uint8(license.licenseType), uint8(INFTLicensing.LicenseType.Commercial));
        assertTrue(license.isOriginalGrant);
        assertEq(license.instanceId, 1);

        assertEq(nft.getArtwork(artworkId).commercialCount, 1);
    }

    function test_MintDisplayLicense() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        uint256 tokenId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Display, bob);

        INFTLicensing.LicenseInfo memory license = nft.getLicenseInfo(tokenId);
        assertEq(uint8(license.licenseType), uint8(INFTLicensing.LicenseType.Display));
        assertEq(license.instanceId, 1);

        assertEq(nft.getArtwork(artworkId).displayCount, 1);
    }

    function test_MintMultipleLicenses() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.startPrank(alice);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, bob);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, charlie);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Display, bob);
        vm.stopPrank();

        INFTLicensing.Artwork memory artwork = nft.getArtwork(artworkId);
        assertEq(artwork.commercialCount, 2);
        assertEq(artwork.displayCount, 1);
    }

    function test_RevertMintLicense_NotCopyrightOwner() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NotCopyrightOwner.selector);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, bob);
    }

    function test_RevertMintLicense_CopyrightType() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        vm.expectRevert(INFTLicensing.InvalidLicenseType.selector);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Copyright, bob);
    }

    function test_RevertMintLicense_ArtworkDoesNotExist() public {
        vm.prank(alice);
        vm.expectRevert(INFTLicensing.ArtworkDoesNotExist.selector);
        nft.mintLicense(999, INFTLicensing.LicenseType.Commercial, bob);
    }

    function test_RevertMintLicense_ZeroAddress() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        vm.expectRevert(INFTLicensing.ZeroAddress.selector);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, address(0));
    }

    // ============ transferCopyrightWithRetention Tests ============

    function test_TransferCopyrightNoRetention() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit CopyrightTransferred(artworkId, alice, bob, INFTLicensing.RetentionType.None);
        nft.transferCopyrightWithRetention(artworkId, bob, INFTLicensing.RetentionType.None);

        assertEq(nft.ownerOf(copyrightTokenId), bob);
        assertTrue(nft.getArtwork(artworkId).copyrightTransferred);
    }

    function test_TransferCopyrightWithCommercialRetention() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        nft.transferCopyrightWithRetention(artworkId, bob, INFTLicensing.RetentionType.Commercial);

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);
        assertEq(nft.ownerOf(copyrightTokenId), bob);

        // Alice should have retained commercial license
        uint256 retainedTokenId = TokenIdCodec.encode(artworkId, 1, 1); // Commercial, instance 1
        assertEq(nft.ownerOf(retainedTokenId), alice);

        INFTLicensing.LicenseInfo memory license = nft.getLicenseInfo(retainedTokenId);
        assertEq(uint8(license.licenseType), uint8(INFTLicensing.LicenseType.Commercial));
        assertFalse(license.isOriginalGrant); // Retained licenses are NOT original grants
    }

    function test_TransferCopyrightWithDisplayRetention() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        nft.transferCopyrightWithRetention(artworkId, bob, INFTLicensing.RetentionType.Display);

        // Alice should have retained display license
        uint256 retainedTokenId = TokenIdCodec.encode(artworkId, 2, 1); // Display, instance 1
        assertEq(nft.ownerOf(retainedTokenId), alice);

        INFTLicensing.LicenseInfo memory license = nft.getLicenseInfo(retainedTokenId);
        assertEq(uint8(license.licenseType), uint8(INFTLicensing.LicenseType.Display));
        assertFalse(license.isOriginalGrant);
    }

    function test_NewCopyrightOwnerCanMintLicenses() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        nft.transferCopyrightWithRetention(artworkId, bob, INFTLicensing.RetentionType.None);

        // Bob should now be able to mint licenses
        vm.prank(bob);
        uint256 tokenId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, charlie);

        assertEq(nft.ownerOf(tokenId), charlie);
    }

    function test_RevertTransferCopyright_AlreadyTransferred() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(alice);
        nft.transferCopyrightWithRetention(artworkId, bob, INFTLicensing.RetentionType.None);

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.CopyrightAlreadyTransferred.selector);
        nft.transferCopyrightWithRetention(artworkId, charlie, INFTLicensing.RetentionType.None);
    }

    function test_RevertTransferCopyright_NotOwner() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NotCopyrightOwner.selector);
        nft.transferCopyrightWithRetention(artworkId, charlie, INFTLicensing.RetentionType.None);
    }

    // ============ View Functions Tests ============

    function test_TokenURI() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://QmTest123");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);
        assertEq(nft.tokenURI(copyrightTokenId), "ipfs://QmTest123");

        // Mint a license and check its URI too
        vm.prank(alice);
        uint256 licenseTokenId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, bob);
        assertEq(nft.tokenURI(licenseTokenId), "ipfs://QmTest123");
    }

    function test_CanTransfer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://test");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        // Copyright can transfer (not yet transferred)
        assertTrue(nft.canTransfer(copyrightTokenId));

        // Mint a license
        vm.prank(alice);
        uint256 licenseTokenId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, bob);

        // License can transfer (original grant = unlimited)
        assertTrue(nft.canTransfer(licenseTokenId));
    }
}
