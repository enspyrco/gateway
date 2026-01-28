// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {NFTLicensingSystem} from "../src/NFTLicensingSystem.sol";
import {INFTLicensing} from "../src/interfaces/INFTLicensing.sol";
import {TokenIdCodec} from "../src/libraries/TokenIdCodec.sol";

/// @title TransferRestrictionsTest
/// @notice Comprehensive tests for transfer restriction logic
contract TransferRestrictionsTest is Test {
    NFTLicensingSystem public nft;

    address public artist = makeAddr("artist");
    address public buyer1 = makeAddr("buyer1");
    address public buyer2 = makeAddr("buyer2");
    address public buyer3 = makeAddr("buyer3");
    address public collector = makeAddr("collector");

    event LicenseTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bool isFirstTransfer
    );

    function setUp() public {
        nft = new NFTLicensingSystem();
    }

    // ============ Copyright Transfer Tests ============

    function test_CopyrightCanTransferOnce() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        // First transfer should succeed
        vm.prank(artist);
        nft.transferFrom(artist, buyer1, copyrightTokenId);

        assertEq(nft.ownerOf(copyrightTokenId), buyer1);
        assertTrue(nft.getArtwork(artworkId).copyrightTransferred);
    }

    function test_CopyrightCannotTransferTwice_DirectTransfer() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        // First transfer
        vm.prank(artist);
        nft.transferFrom(artist, buyer1, copyrightTokenId);

        // Second transfer should fail
        vm.prank(buyer1);
        vm.expectRevert(INFTLicensing.CopyrightAlreadyTransferred.selector);
        nft.transferFrom(buyer1, buyer2, copyrightTokenId);
    }

    function test_CopyrightCannotTransferTwice_WithRetention() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        // Transfer with retention
        vm.prank(artist);
        nft.transferCopyrightWithRetention(artworkId, buyer1, INFTLicensing.RetentionType.Commercial);

        // Buyer1 cannot transfer copyright again
        vm.prank(buyer1);
        vm.expectRevert(INFTLicensing.CopyrightAlreadyTransferred.selector);
        nft.transferFrom(buyer1, buyer2, copyrightTokenId);
    }

    // ============ Original Grant License Tests ============

    function test_OriginalGrantLicense_UnlimitedResale() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Artist mints commercial license to buyer1
        vm.prank(artist);
        uint256 licenseId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);

        // buyer1 transfers to buyer2
        vm.prank(buyer1);
        nft.transferFrom(buyer1, buyer2, licenseId);
        assertEq(nft.ownerOf(licenseId), buyer2);

        // buyer2 transfers to buyer3
        vm.prank(buyer2);
        nft.transferFrom(buyer2, buyer3, licenseId);
        assertEq(nft.ownerOf(licenseId), buyer3);

        // buyer3 transfers to collector
        vm.prank(buyer3);
        nft.transferFrom(buyer3, collector, licenseId);
        assertEq(nft.ownerOf(licenseId), collector);

        // This should continue indefinitely for original grants
        assertTrue(nft.canTransfer(licenseId));
    }

    function test_OriginalGrantLicense_MultipleHolders() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Mint multiple licenses
        vm.startPrank(artist);
        uint256 license1 = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);
        uint256 license2 = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer2);
        vm.stopPrank();

        // Each can resell unlimited times
        vm.prank(buyer1);
        nft.transferFrom(buyer1, collector, license1);

        vm.prank(buyer2);
        nft.transferFrom(buyer2, collector, license2);

        // Collector owns both and can resell both
        assertTrue(nft.canTransfer(license1));
        assertTrue(nft.canTransfer(license2));
    }

    // ============ Retained License Tests ============

    function test_RetainedLicense_CanResellOnce() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Transfer copyright with retention
        vm.prank(artist);
        nft.transferCopyrightWithRetention(artworkId, buyer1, INFTLicensing.RetentionType.Commercial);

        // Artist retained commercial license
        uint256 retainedLicenseId = TokenIdCodec.encode(artworkId, 1, 1);
        assertEq(nft.ownerOf(retainedLicenseId), artist);

        // Verify it's not an original grant
        INFTLicensing.LicenseInfo memory license = nft.getLicenseInfo(retainedLicenseId);
        assertFalse(license.isOriginalGrant);

        // Artist can resell once
        vm.prank(artist);
        nft.transferFrom(artist, buyer2, retainedLicenseId);
        assertEq(nft.ownerOf(retainedLicenseId), buyer2);
    }

    function test_RetainedLicense_CannotResellTwice() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Transfer copyright with retention
        vm.prank(artist);
        nft.transferCopyrightWithRetention(artworkId, buyer1, INFTLicensing.RetentionType.Commercial);

        uint256 retainedLicenseId = TokenIdCodec.encode(artworkId, 1, 1);

        // Artist resells
        vm.prank(artist);
        nft.transferFrom(artist, buyer2, retainedLicenseId);

        // buyer2 cannot resell
        vm.prank(buyer2);
        vm.expectRevert(INFTLicensing.AlreadyResold.selector);
        nft.transferFrom(buyer2, buyer3, retainedLicenseId);
    }

    function test_RetainedDisplayLicense_CanResellOnce() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Transfer copyright with display retention
        vm.prank(artist);
        nft.transferCopyrightWithRetention(artworkId, buyer1, INFTLicensing.RetentionType.Display);

        uint256 retainedLicenseId = TokenIdCodec.encode(artworkId, 2, 1); // Display type
        assertEq(nft.ownerOf(retainedLicenseId), artist);

        // Artist can resell once
        vm.prank(artist);
        nft.transferFrom(artist, buyer2, retainedLicenseId);

        // buyer2 cannot resell
        vm.prank(buyer2);
        vm.expectRevert(INFTLicensing.AlreadyResold.selector);
        nft.transferFrom(buyer2, buyer3, retainedLicenseId);
    }

    // ============ Complex Scenario Tests ============

    function test_FullLifecycle_ArtworkWithMultipleLicenses() public {
        // Artist creates artwork
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://masterpiece");

        // Artist mints licenses to various buyers
        vm.startPrank(artist);
        uint256 commercial1 = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);
        uint256 commercial2 = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer2);
        uint256 display1 = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Display, collector);
        vm.stopPrank();

        // Verify watermark
        assertEq(nft.getOriginalMinter(artworkId), artist);

        // Artist sells copyright with commercial retention
        vm.prank(artist);
        nft.transferCopyrightWithRetention(artworkId, buyer3, INFTLicensing.RetentionType.Commercial);

        uint256 retainedLicense = TokenIdCodec.encode(artworkId, 1, 3); // Third commercial license

        // Watermark still persists
        assertEq(nft.getOriginalMinter(artworkId), artist);

        // New copyright owner can mint more licenses
        vm.prank(buyer3);
        uint256 newLicense = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Display, collector);

        // Original grants can resell multiple times
        vm.prank(buyer1);
        nft.transferFrom(buyer1, collector, commercial1);
        vm.prank(collector);
        nft.transferFrom(collector, artist, commercial1);

        // Retained license can only resell once
        vm.prank(artist);
        nft.transferFrom(artist, collector, retainedLicense);

        vm.prank(collector);
        vm.expectRevert(INFTLicensing.AlreadyResold.selector);
        nft.transferFrom(collector, buyer1, retainedLicense);
    }

    function test_Scenario_SecondaryBuyer_OriginalGrant() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Artist mints to buyer1 (original grant)
        vm.prank(artist);
        uint256 licenseId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);

        // buyer1 sells to buyer2
        vm.prank(buyer1);
        nft.transferFrom(buyer1, buyer2, licenseId);

        // buyer2 can still resell (original grant has unlimited transfers)
        vm.prank(buyer2);
        nft.transferFrom(buyer2, buyer3, licenseId);

        // buyer3 can still resell
        vm.prank(buyer3);
        nft.transferFrom(buyer3, collector, licenseId);

        assertTrue(nft.canTransfer(licenseId));
    }

    function test_Scenario_MixedLicenseTypes() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Mint different license types
        vm.startPrank(artist);
        uint256 commercial = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);
        uint256 display = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Display, buyer2);
        vm.stopPrank();

        // Both are original grants, both can transfer unlimited
        vm.prank(buyer1);
        nft.transferFrom(buyer1, collector, commercial);

        vm.prank(buyer2);
        nft.transferFrom(buyer2, collector, display);

        // Collector can transfer both again
        vm.startPrank(collector);
        nft.transferFrom(collector, buyer3, commercial);
        nft.transferFrom(collector, buyer3, display);
        vm.stopPrank();

        assertTrue(nft.canTransfer(commercial));
        assertTrue(nft.canTransfer(display));
    }

    function test_CanTransfer_ReturnsFalse_AfterResold() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        // Transfer copyright with retention
        vm.prank(artist);
        nft.transferCopyrightWithRetention(artworkId, buyer1, INFTLicensing.RetentionType.Commercial);

        uint256 retainedLicenseId = TokenIdCodec.encode(artworkId, 1, 1);

        // Before resale - can transfer
        assertTrue(nft.canTransfer(retainedLicenseId));

        // Artist resells
        vm.prank(artist);
        nft.transferFrom(artist, buyer2, retainedLicenseId);

        // After resale - cannot transfer
        assertFalse(nft.canTransfer(retainedLicenseId));
    }

    function test_CanTransfer_Copyright_AfterTransferred() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        assertTrue(nft.canTransfer(copyrightTokenId));

        vm.prank(artist);
        nft.transferFrom(artist, buyer1, copyrightTokenId);

        assertFalse(nft.canTransfer(copyrightTokenId));
    }

    // ============ Edge Cases ============

    function test_SafeTransferFrom_RespectsRestrictions() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        // First safe transfer should work
        vm.prank(artist);
        nft.safeTransferFrom(artist, buyer1, copyrightTokenId);

        // Second safe transfer should fail
        vm.prank(buyer1);
        vm.expectRevert(INFTLicensing.CopyrightAlreadyTransferred.selector);
        nft.safeTransferFrom(buyer1, buyer2, copyrightTokenId);
    }

    function test_TransferFromWithData_RespectsRestrictions() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        // First transfer with data should work
        vm.prank(artist);
        nft.safeTransferFrom(artist, buyer1, copyrightTokenId, "");

        // Second should fail
        vm.prank(buyer1);
        vm.expectRevert(INFTLicensing.CopyrightAlreadyTransferred.selector);
        nft.safeTransferFrom(buyer1, buyer2, copyrightTokenId, "");
    }

    // ============ Events Tests ============

    function test_LicenseTransferredEvent_FirstTransfer() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        vm.prank(artist);
        uint256 licenseId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);

        vm.prank(buyer1);
        vm.expectEmit(true, true, true, true);
        emit LicenseTransferred(licenseId, buyer1, buyer2, true);
        nft.transferFrom(buyer1, buyer2, licenseId);
    }

    function test_LicenseTransferredEvent_SubsequentTransfer() public {
        vm.prank(artist);
        uint160 artworkId = nft.createArtwork("ipfs://art");

        vm.prank(artist);
        uint256 licenseId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, buyer1);

        vm.prank(buyer1);
        nft.transferFrom(buyer1, buyer2, licenseId);

        vm.prank(buyer2);
        vm.expectEmit(true, true, true, true);
        emit LicenseTransferred(licenseId, buyer2, buyer3, false);
        nft.transferFrom(buyer2, buyer3, licenseId);
    }
}
