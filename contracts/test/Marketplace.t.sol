// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NFTLicensingSystem} from "../src/NFTLicensingSystem.sol";
import {INFTLicensing} from "../src/interfaces/INFTLicensing.sol";
import {TokenIdCodec} from "../src/libraries/TokenIdCodec.sol";

contract MarketplaceTest is Test {
    NFTLicensingSystem public nft;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 constant ASKING_PRICE = 1 ether;
    uint256 constant OFFER_AMOUNT = 0.8 ether;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 askingPrice);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event OfferMade(uint256 indexed tokenId, address indexed offerer, uint256 amount, uint256 offerIndex);
    event OfferAccepted(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 amount);
    event OfferRejected(uint256 indexed tokenId, address indexed offerer, uint256 amount);
    event OfferWithdrawn(uint256 indexed tokenId, address indexed offerer, uint256 amount);

    function setUp() public {
        nft = new NFTLicensingSystem();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // ============ Listing Tests ============

    function test_ListForSale() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.expectEmit(true, true, false, true);
        emit Listed(tokenId, alice, ASKING_PRICE);

        nft.listForSale(tokenId, ASKING_PRICE);

        INFTLicensing.Listing memory listing = nft.getListing(tokenId);
        assertEq(listing.askingPrice, ASKING_PRICE);
        assertTrue(listing.isActive);
        vm.stopPrank();
    }

    function test_ListForSale_CommercialLicense() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, alice);

        nft.listForSale(tokenId, ASKING_PRICE);

        INFTLicensing.Listing memory listing = nft.getListing(tokenId);
        assertTrue(listing.isActive);
        vm.stopPrank();
    }

    function test_RevertListForSale_NotTokenOwner() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NotTokenOwner.selector);
        nft.listForSale(tokenId, ASKING_PRICE);
    }

    function test_RevertListForSale_AlreadyListed() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        nft.listForSale(tokenId, ASKING_PRICE);

        vm.expectRevert(INFTLicensing.AlreadyListed.selector);
        nft.listForSale(tokenId, ASKING_PRICE * 2);
        vm.stopPrank();
    }

    function test_CancelListing() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        nft.listForSale(tokenId, ASKING_PRICE);

        vm.expectEmit(true, true, false, false);
        emit ListingCancelled(tokenId, alice);

        nft.cancelListing(tokenId);

        INFTLicensing.Listing memory listing = nft.getListing(tokenId);
        assertFalse(listing.isActive);
        vm.stopPrank();
    }

    function test_RevertCancelListing_NotOwner() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NotTokenOwner.selector);
        nft.cancelListing(tokenId);
    }

    function test_RevertCancelListing_NotListed() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.expectRevert(INFTLicensing.NotListed.selector);
        nft.cancelListing(tokenId);
        vm.stopPrank();
    }

    // ============ Offer Tests ============

    function test_MakeOffer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit OfferMade(tokenId, bob, OFFER_AMOUNT, 0);

        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        INFTLicensing.Offer[] memory offers = nft.getOffers(tokenId);
        assertEq(offers.length, 1);
        assertEq(offers[0].offerer, bob);
        assertEq(offers[0].amount, OFFER_AMOUNT);
        assertTrue(offers[0].isActive);
    }

    function test_MakeMultipleOffers() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(charlie);
        nft.makeOffer{value: OFFER_AMOUNT + 0.1 ether}(tokenId);

        INFTLicensing.Offer[] memory offers = nft.getOffers(tokenId);
        assertEq(offers.length, 2);
        assertEq(offers[0].offerer, bob);
        assertEq(offers[1].offerer, charlie);
    }

    function test_RevertMakeOffer_NotListed() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NotListed.selector);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);
    }

    function test_RevertMakeOffer_ZeroAmount() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.InvalidOffer.selector);
        nft.makeOffer{value: 0}(tokenId);
    }

    // ============ Accept Offer Tests ============

    function test_AcceptOffer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit OfferAccepted(tokenId, alice, bob, OFFER_AMOUNT);

        nft.acceptOffer(tokenId, 0);

        // Check NFT transferred
        assertEq(nft.ownerOf(tokenId), bob);

        // Check funds transferred
        assertEq(alice.balance, aliceBalanceBefore + OFFER_AMOUNT);

        // Check listing removed
        INFTLicensing.Listing memory listing = nft.getListing(tokenId);
        assertFalse(listing.isActive);
    }

    function test_AcceptOffer_RefundsOtherOffers() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(charlie);
        nft.makeOffer{value: OFFER_AMOUNT + 0.1 ether}(tokenId);

        // Accept charlie's offer (index 1)
        vm.prank(alice);
        nft.acceptOffer(tokenId, 1);

        // Bob should have pending withdrawal
        assertEq(nft.getPendingWithdrawals(bob), OFFER_AMOUNT);
    }

    function test_RevertAcceptOffer_NotOwner() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NotTokenOwner.selector);
        nft.acceptOffer(tokenId, 0);
    }

    function test_RevertAcceptOffer_InvalidIndex() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(alice);
        vm.expectRevert(INFTLicensing.InvalidOffer.selector);
        nft.acceptOffer(tokenId, 0);
    }

    function test_RevertAcceptOffer_InactiveOffer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        // Bob withdraws the offer
        vm.prank(bob);
        nft.withdrawOffer(tokenId, 0);

        // Alice tries to accept the withdrawn offer
        vm.prank(alice);
        vm.expectRevert(INFTLicensing.OfferNotActive.selector);
        nft.acceptOffer(tokenId, 0);
    }

    // ============ Reject Offer Tests ============

    function test_RejectOffer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit OfferRejected(tokenId, bob, OFFER_AMOUNT);

        nft.rejectOffer(tokenId, 0);

        // Offer should be inactive
        INFTLicensing.Offer[] memory offers = nft.getOffers(tokenId);
        assertFalse(offers[0].isActive);

        // Bob should have pending withdrawal
        assertEq(nft.getPendingWithdrawals(bob), OFFER_AMOUNT);
    }

    function test_RevertRejectOffer_NotOwner() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(charlie);
        vm.expectRevert(INFTLicensing.NotTokenOwner.selector);
        nft.rejectOffer(tokenId, 0);
    }

    // ============ Withdraw Offer Tests ============

    function test_WithdrawOffer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        uint256 bobBalanceBefore = bob.balance;

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit OfferWithdrawn(tokenId, bob, OFFER_AMOUNT);

        nft.withdrawOffer(tokenId, 0);

        // Funds returned to bob
        assertEq(bob.balance, bobBalanceBefore + OFFER_AMOUNT);

        // Offer inactive
        INFTLicensing.Offer[] memory offers = nft.getOffers(tokenId);
        assertFalse(offers[0].isActive);
    }

    function test_RevertWithdrawOffer_NotOfferer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(charlie);
        vm.expectRevert(INFTLicensing.NotOfferer.selector);
        nft.withdrawOffer(tokenId, 0);
    }

    // ============ Withdraw (Pending) Tests ============

    function test_Withdraw() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        // Reject the offer to create pending withdrawal
        vm.prank(alice);
        nft.rejectOffer(tokenId, 0);

        uint256 bobBalanceBefore = bob.balance;

        vm.prank(bob);
        nft.withdraw();

        assertEq(bob.balance, bobBalanceBefore + OFFER_AMOUNT);
        assertEq(nft.getPendingWithdrawals(bob), 0);
    }

    function test_RevertWithdraw_NoFunds() public {
        vm.prank(bob);
        vm.expectRevert(INFTLicensing.NoFundsToWithdraw.selector);
        nft.withdraw();
    }

    // ============ GetListings Tests ============

    function test_GetListings() public {
        vm.startPrank(alice);
        uint160 artworkId1 = nft.createArtwork("ipfs://1");
        uint256 tokenId1 = TokenIdCodec.copyrightTokenId(artworkId1);
        nft.listForSale(tokenId1, 1 ether);

        uint160 artworkId2 = nft.createArtwork("ipfs://2");
        uint256 tokenId2 = TokenIdCodec.copyrightTokenId(artworkId2);
        nft.listForSale(tokenId2, 2 ether);
        vm.stopPrank();

        (uint256[] memory tokenIds, INFTLicensing.Listing[] memory listings) = nft.getListings();

        assertEq(tokenIds.length, 2);
        assertEq(listings.length, 2);
        assertEq(listings[0].askingPrice, 1 ether);
        assertEq(listings[1].askingPrice, 2 ether);
    }

    function test_GetListings_AfterCancellation() public {
        vm.startPrank(alice);
        uint160 artworkId1 = nft.createArtwork("ipfs://1");
        uint256 tokenId1 = TokenIdCodec.copyrightTokenId(artworkId1);
        nft.listForSale(tokenId1, 1 ether);

        uint160 artworkId2 = nft.createArtwork("ipfs://2");
        uint256 tokenId2 = TokenIdCodec.copyrightTokenId(artworkId2);
        nft.listForSale(tokenId2, 2 ether);

        nft.cancelListing(tokenId1);
        vm.stopPrank();

        (uint256[] memory tokenIds,) = nft.getListings();
        assertEq(tokenIds.length, 1);
        assertEq(tokenIds[0], tokenId2);
    }

    // ============ GetOwnedTokens Tests ============

    function test_GetOwnedTokens() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, alice);
        nft.mintLicense(artworkId, INFTLicensing.LicenseType.Display, alice);
        vm.stopPrank();

        uint256[] memory tokens = nft.getOwnedTokens(alice);
        assertEq(tokens.length, 3); // copyright + commercial + display
    }

    function test_GetOwnedTokens_AfterTransfer() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(alice);
        nft.acceptOffer(tokenId, 0);

        uint256[] memory aliceTokens = nft.getOwnedTokens(alice);
        uint256[] memory bobTokens = nft.getOwnedTokens(bob);

        assertEq(aliceTokens.length, 0);
        assertEq(bobTokens.length, 1);
    }

    // ============ Watermark Tests ============

    function test_WatermarkPersistsAfterSale() public {
        vm.prank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 tokenId = TokenIdCodec.copyrightTokenId(artworkId);

        vm.prank(alice);
        nft.listForSale(tokenId, ASKING_PRICE);

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(tokenId);

        vm.prank(alice);
        nft.acceptOffer(tokenId, 0);

        // Check watermark (originalMinter) persists after transfer
        INFTLicensing.Artwork memory artwork = nft.getArtwork(artworkId);
        assertEq(artwork.originalMinter, alice);
    }

    // ============ Edge Case Tests ============

    function test_ListingCancelledOnDirectTransfer() public {
        // Copyright token can only be transferred once, so test with a commercial license
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 commercialToken = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, alice);

        nft.listForSale(commercialToken, ASKING_PRICE);
        vm.stopPrank();

        // Bob makes an offer
        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(commercialToken);

        // Alice transfers directly to charlie (not through marketplace)
        vm.prank(alice);
        nft.transferFrom(alice, charlie, commercialToken);

        // Listing should be cancelled
        INFTLicensing.Listing memory listing = nft.getListing(commercialToken);
        assertFalse(listing.isActive);

        // Bob's offer should be refunded to pending withdrawals
        assertEq(nft.getPendingWithdrawals(bob), OFFER_AMOUNT);
    }

    function test_CanRelistAfterCancellation() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 commercialToken = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, alice);

        nft.listForSale(commercialToken, ASKING_PRICE);
        nft.cancelListing(commercialToken);
        nft.listForSale(commercialToken, ASKING_PRICE * 2);

        INFTLicensing.Listing memory listing = nft.getListing(commercialToken);
        assertTrue(listing.isActive);
        assertEq(listing.askingPrice, ASKING_PRICE * 2);
        vm.stopPrank();
    }

    function test_BuyerCanRelistAfterPurchase() public {
        vm.startPrank(alice);
        uint160 artworkId = nft.createArtwork("ipfs://art");
        uint256 commercialToken = nft.mintLicense(artworkId, INFTLicensing.LicenseType.Commercial, alice);
        nft.listForSale(commercialToken, ASKING_PRICE);
        vm.stopPrank();

        vm.prank(bob);
        nft.makeOffer{value: OFFER_AMOUNT}(commercialToken);

        vm.prank(alice);
        nft.acceptOffer(commercialToken, 0);

        // Bob can now list the token
        vm.prank(bob);
        nft.listForSale(commercialToken, ASKING_PRICE * 2);

        INFTLicensing.Listing memory listing = nft.getListing(commercialToken);
        assertTrue(listing.isActive);
        assertEq(listing.askingPrice, ASKING_PRICE * 2);
    }
}
