// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INFTLicensing} from "./interfaces/INFTLicensing.sol";
import {TokenIdCodec} from "./libraries/TokenIdCodec.sol";

/// @title NFTLicensingSystem
/// @notice Multi-tier NFT licensing system with permanent watermark and transfer restrictions
/// @dev Implements ERC721 with custom transfer logic for different license types
contract NFTLicensingSystem is ERC721, ReentrancyGuard, Pausable, Ownable, INFTLicensing {
    using TokenIdCodec for uint256;

    // ============ State Variables ============

    /// @notice Counter for generating unique artwork IDs
    uint160 private _artworkIdCounter;

    /// @notice Mapping from artwork ID to artwork data
    mapping(uint160 => Artwork) private _artworks;

    /// @notice Mapping from token ID to license info
    mapping(uint256 => LicenseInfo) private _licenses;

    /// @notice Tracks whether a token has been resold by a secondary holder
    /// @dev tokenId => hasBeenResold
    mapping(uint256 => bool) private _hasBeenResold;

    /// @notice Tracks the original recipient of each token for resale tracking
    /// @dev tokenId => original recipient (first non-minter owner)
    mapping(uint256 => address) private _originalRecipient;

    /// @notice Flag to indicate if we're in transferCopyrightWithRetention (to avoid duplicate events)
    bool private _inCopyrightTransfer;

    // ============ Marketplace State Variables ============

    /// @notice Mapping from token ID to listing
    mapping(uint256 => Listing) private _listings;

    /// @notice Mapping from token ID to offers
    mapping(uint256 => Offer[]) private _offers;

    /// @notice Mapping from address to pending withdrawals (refunds)
    mapping(address => uint256) private _pendingWithdrawals;

    /// @notice Array of all token IDs with active listings
    uint256[] private _listedTokens;

    /// @notice Mapping from token ID to its index in _listedTokens (for efficient removal)
    mapping(uint256 => uint256) private _listedTokenIndex;

    // ============ Enumeration State Variables ============

    /// @notice Mapping from owner to list of owned token IDs
    mapping(address => uint256[]) private _ownedTokens;

    /// @notice Mapping from token ID to index in owner's token list
    mapping(uint256 => uint256) private _ownedTokensIndex;

    /// @notice Flag to indicate if we're in marketplace transfer (skip listing cleanup in _update)
    bool private _inMarketplaceTransfer;

    // ============ Constructor ============

    constructor() ERC721("NFT Licensing System", "NFTL") Ownable(msg.sender) {}

    // ============ External Functions ============

    /// @notice Creates a new artwork and mints the copyright token to the caller
    /// @param metadataURI The URI for artwork metadata (contains title, image, etc.)
    /// @return artworkId The unique identifier for the artwork
    function createArtwork(string calldata metadataURI) external whenNotPaused returns (uint160 artworkId) {
        artworkId = ++_artworkIdCounter;

        _artworks[artworkId] = Artwork({
            originalMinter: msg.sender,
            commercialCount: 0,
            displayCount: 0,
            copyrightTransferred: false,
            metadataURI: metadataURI
        });

        // Mint copyright token (license type 0, instance 0)
        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);

        _licenses[copyrightTokenId] = LicenseInfo({
            artworkId: artworkId,
            licenseType: LicenseType.Copyright,
            isOriginalGrant: true,
            instanceId: 0
        });

        _mint(msg.sender, copyrightTokenId);

        emit ArtworkCreated(artworkId, msg.sender, metadataURI);
        emit LicenseMinted(copyrightTokenId, artworkId, LicenseType.Copyright, msg.sender, 0);
    }

    /// @inheritdoc INFTLicensing
    function mintLicense(
        uint160 artworkId,
        LicenseType licenseType,
        address to
    ) external whenNotPaused returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();

        Artwork storage artwork = _artworks[artworkId];
        if (artwork.originalMinter == address(0)) revert ArtworkDoesNotExist();

        // Only copyright owner can mint licenses
        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);
        if (ownerOf(copyrightTokenId) != msg.sender) revert NotCopyrightOwner();

        // Cannot mint copyright licenses (only one exists per artwork)
        if (licenseType == LicenseType.Copyright) revert InvalidLicenseType();

        uint88 instanceId;
        if (licenseType == LicenseType.Commercial) {
            instanceId = ++artwork.commercialCount;
        } else if (licenseType == LicenseType.Display) {
            instanceId = ++artwork.displayCount;
        } else {
            revert InvalidLicenseType();
        }

        tokenId = TokenIdCodec.encode(artworkId, uint8(licenseType), instanceId);

        _licenses[tokenId] = LicenseInfo({
            artworkId: artworkId,
            licenseType: licenseType,
            isOriginalGrant: true,
            instanceId: instanceId
        });

        _originalRecipient[tokenId] = to;
        _mint(to, tokenId);

        emit LicenseMinted(tokenId, artworkId, licenseType, to, instanceId);
    }

    /// @inheritdoc INFTLicensing
    function transferCopyrightWithRetention(
        uint160 artworkId,
        address to,
        RetentionType retention
    ) external whenNotPaused {
        if (to == address(0)) revert ZeroAddress();

        Artwork storage artwork = _artworks[artworkId];
        if (artwork.originalMinter == address(0)) revert ArtworkDoesNotExist();
        if (artwork.copyrightTransferred) revert CopyrightAlreadyTransferred();

        uint256 copyrightTokenId = TokenIdCodec.copyrightTokenId(artworkId);
        address currentOwner = ownerOf(copyrightTokenId);
        if (currentOwner != msg.sender) revert NotCopyrightOwner();

        // Handle retention if requested
        if (retention != RetentionType.None) {
            LicenseType retainType = retention == RetentionType.Commercial
                ? LicenseType.Commercial
                : LicenseType.Display;

            uint88 instanceId;
            if (retainType == LicenseType.Commercial) {
                instanceId = ++artwork.commercialCount;
            } else {
                instanceId = ++artwork.displayCount;
            }

            uint256 retainedTokenId = TokenIdCodec.encode(artworkId, uint8(retainType), instanceId);

            // Retained licenses follow normal resale rules (one sale per wallet)
            // NOT unlimited like copyright-owner-minted licenses
            _licenses[retainedTokenId] = LicenseInfo({
                artworkId: artworkId,
                licenseType: retainType,
                isOriginalGrant: false,  // Not an original grant - limited resale
                instanceId: instanceId
            });

            _originalRecipient[retainedTokenId] = msg.sender;
            _mint(msg.sender, retainedTokenId);

            emit LicenseMinted(retainedTokenId, artworkId, retainType, msg.sender, instanceId);
        }

        // Transfer the copyright token (use flag to prevent duplicate event emission)
        _inCopyrightTransfer = true;
        _transfer(currentOwner, to, copyrightTokenId);
        _inCopyrightTransfer = false;

        emit CopyrightTransferred(artworkId, currentOwner, to, retention);
    }

    // ============ View Functions ============

    /// @inheritdoc INFTLicensing
    function getArtwork(uint160 artworkId) external view returns (Artwork memory) {
        return _artworks[artworkId];
    }

    /// @inheritdoc INFTLicensing
    function getLicenseInfo(uint256 tokenId) external view returns (LicenseInfo memory) {
        return _licenses[tokenId];
    }

    /// @inheritdoc INFTLicensing
    function getOriginalMinter(uint160 artworkId) external view returns (address) {
        return _artworks[artworkId].originalMinter;
    }

    /// @inheritdoc INFTLicensing
    function canTransfer(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;

        LicenseInfo storage license = _licenses[tokenId];

        // Copyright tokens can only transfer once
        if (license.licenseType == LicenseType.Copyright) {
            return !_artworks[license.artworkId].copyrightTransferred;
        }

        // Original grants from copyright owner have unlimited resale
        if (license.isOriginalGrant) {
            return true;
        }

        // Secondary holders can only resell once
        return !_hasBeenResold[tokenId];
    }

    /// @notice Returns the token URI for a given token
    /// @param tokenId The token ID
    /// @return The metadata URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint160 artworkId = tokenId.getArtworkId();
        return _artworks[artworkId].metadataURI;
    }

    // ============ Marketplace Functions ============

    /// @inheritdoc INFTLicensing
    function listForSale(uint256 tokenId, uint256 askingPrice) external whenNotPaused {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (_listings[tokenId].isActive) revert AlreadyListed();
        if (askingPrice == 0) revert InvalidOffer();

        _listings[tokenId] = Listing({
            askingPrice: askingPrice,
            isActive: true
        });

        // Add to listed tokens array
        _listedTokenIndex[tokenId] = _listedTokens.length;
        _listedTokens.push(tokenId);

        emit Listed(tokenId, msg.sender, askingPrice);
    }

    /// @inheritdoc INFTLicensing
    function cancelListing(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (!_listings[tokenId].isActive) revert NotListed();

        _removeListing(tokenId);

        emit ListingCancelled(tokenId, msg.sender);
    }

    /// @inheritdoc INFTLicensing
    function makeOffer(uint256 tokenId) external payable whenNotPaused {
        if (!_listings[tokenId].isActive) revert NotListed();
        if (msg.value == 0) revert InvalidOffer();

        uint256 offerIndex = _offers[tokenId].length;
        _offers[tokenId].push(Offer({
            offerer: msg.sender,
            amount: msg.value,
            isActive: true
        }));

        emit OfferMade(tokenId, msg.sender, msg.value, offerIndex);
    }

    /// @inheritdoc INFTLicensing
    function acceptOffer(uint256 tokenId, uint256 offerIndex) external nonReentrant whenNotPaused {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (offerIndex >= _offers[tokenId].length) revert InvalidOffer();

        Offer storage offer = _offers[tokenId][offerIndex];
        if (!offer.isActive) revert OfferNotActive();

        address buyer = offer.offerer;
        uint256 amount = offer.amount;

        // Deactivate the accepted offer
        offer.isActive = false;

        // Refund all other active offers
        _refundOtherOffers(tokenId, offerIndex);

        // Remove listing
        _removeListing(tokenId);

        // Transfer NFT to buyer first (checks-effects-interactions pattern)
        _inMarketplaceTransfer = true;
        _transfer(msg.sender, buyer, tokenId);
        _inMarketplaceTransfer = false;

        // Transfer funds to seller last to prevent reentrancy
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit OfferAccepted(tokenId, msg.sender, buyer, amount);
    }

    /// @inheritdoc INFTLicensing
    function rejectOffer(uint256 tokenId, uint256 offerIndex) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (offerIndex >= _offers[tokenId].length) revert InvalidOffer();

        Offer storage offer = _offers[tokenId][offerIndex];
        if (!offer.isActive) revert OfferNotActive();

        address offerer = offer.offerer;
        uint256 amount = offer.amount;

        // Deactivate the offer
        offer.isActive = false;

        // Add to pending withdrawals for the offerer
        _pendingWithdrawals[offerer] += amount;

        emit OfferRejected(tokenId, offerer, amount);
    }

    /// @inheritdoc INFTLicensing
    function withdrawOffer(uint256 tokenId, uint256 offerIndex) external nonReentrant {
        if (offerIndex >= _offers[tokenId].length) revert InvalidOffer();

        Offer storage offer = _offers[tokenId][offerIndex];
        if (offer.offerer != msg.sender) revert NotOfferer();
        if (!offer.isActive) revert OfferNotActive();

        uint256 amount = offer.amount;

        // Deactivate the offer
        offer.isActive = false;

        // Return funds to offerer
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit OfferWithdrawn(tokenId, msg.sender, amount);
    }

    /// @inheritdoc INFTLicensing
    function withdraw() external nonReentrant {
        uint256 amount = _pendingWithdrawals[msg.sender];
        if (amount == 0) revert NoFundsToWithdraw();

        _pendingWithdrawals[msg.sender] = 0;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // ============ Admin Functions ============

    /// @notice Pause all marketplace and minting operations
    /// @dev Only callable by contract owner
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause all marketplace and minting operations
    /// @dev Only callable by contract owner
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc INFTLicensing
    function getListings() external view returns (uint256[] memory tokenIds, Listing[] memory listingData) {
        uint256 count = _listedTokens.length;
        tokenIds = new uint256[](count);
        listingData = new Listing[](count);

        for (uint256 i = 0; i < count; i++) {
            tokenIds[i] = _listedTokens[i];
            listingData[i] = _listings[_listedTokens[i]];
        }
    }

    /// @inheritdoc INFTLicensing
    function getOffers(uint256 tokenId) external view returns (Offer[] memory) {
        return _offers[tokenId];
    }

    /// @inheritdoc INFTLicensing
    function getOwnedTokens(address owner) external view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }

    /// @inheritdoc INFTLicensing
    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    /// @inheritdoc INFTLicensing
    function getPendingWithdrawals(address user) external view returns (uint256) {
        return _pendingWithdrawals[user];
    }

    // ============ Internal Functions ============

    /// @notice Override ERC721 _update to enforce transfer restrictions and handle enumeration
    /// @dev Called on mint, burn, and transfer operations
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address from) {
        from = super._update(to, tokenId, auth);

        // Handle enumeration for mints
        if (from == address(0)) {
            _addTokenToOwnerEnumeration(to, tokenId);
            return from;
        }

        // Handle enumeration for burns
        if (to == address(0)) {
            _removeTokenFromOwnerEnumeration(from, tokenId);
            return from;
        }

        // Handle transfers - update enumeration
        _removeTokenFromOwnerEnumeration(from, tokenId);
        _addTokenToOwnerEnumeration(to, tokenId);

        // If transferred outside marketplace, cancel any active listing and refund offers
        if (!_inMarketplaceTransfer && _listings[tokenId].isActive) {
            _removeListing(tokenId);
            _refundAllOffers(tokenId);
        }

        LicenseInfo storage license = _licenses[tokenId];

        // Handle copyright token transfers
        if (license.licenseType == LicenseType.Copyright) {
            // Copyright can only transfer once
            if (_artworks[license.artworkId].copyrightTransferred) {
                revert CopyrightAlreadyTransferred();
            }
            // Mark as transferred
            _artworks[license.artworkId].copyrightTransferred = true;

            emit LicenseTransferred(tokenId, from, to, true);
            // Only emit CopyrightTransferred if not called from transferCopyrightWithRetention
            // (which emits its own event with the retention type)
            if (!_inCopyrightTransfer) {
                emit CopyrightTransferred(license.artworkId, from, to, RetentionType.None);
            }
            return from;
        }

        // Handle commercial/display license transfers
        if (license.isOriginalGrant) {
            // Original grants from copyright owner can be resold unlimited times
            // Track if this is the first transfer from the original recipient
            bool isFirstTransfer = (from == _originalRecipient[tokenId]);
            emit LicenseTransferred(tokenId, from, to, isFirstTransfer);
            return from;
        }

        // Non-original grants (retained licenses or secondary purchases) can only resell once
        if (_hasBeenResold[tokenId]) {
            revert AlreadyResold();
        }

        _hasBeenResold[tokenId] = true;
        emit LicenseTransferred(tokenId, from, to, false);

        return from;
    }

    /// @notice Removes a listing from the active listings array
    function _removeListing(uint256 tokenId) internal {
        if (!_listings[tokenId].isActive) return;

        _listings[tokenId].isActive = false;

        // Remove from _listedTokens array using swap-and-pop
        uint256 lastIndex = _listedTokens.length - 1;
        uint256 tokenIndex = _listedTokenIndex[tokenId];

        if (tokenIndex != lastIndex) {
            uint256 lastTokenId = _listedTokens[lastIndex];
            _listedTokens[tokenIndex] = lastTokenId;
            _listedTokenIndex[lastTokenId] = tokenIndex;
        }

        _listedTokens.pop();
        delete _listedTokenIndex[tokenId];
    }

    /// @notice Refunds all other offers except the accepted one
    function _refundOtherOffers(uint256 tokenId, uint256 acceptedIndex) internal {
        Offer[] storage tokenOffers = _offers[tokenId];
        for (uint256 i = 0; i < tokenOffers.length; i++) {
            if (i != acceptedIndex && tokenOffers[i].isActive) {
                tokenOffers[i].isActive = false;
                _pendingWithdrawals[tokenOffers[i].offerer] += tokenOffers[i].amount;
            }
        }
    }

    /// @notice Refunds all active offers on a token
    function _refundAllOffers(uint256 tokenId) internal {
        Offer[] storage tokenOffers = _offers[tokenId];
        for (uint256 i = 0; i < tokenOffers.length; i++) {
            if (tokenOffers[i].isActive) {
                tokenOffers[i].isActive = false;
                _pendingWithdrawals[tokenOffers[i].offerer] += tokenOffers[i].amount;
            }
        }
    }

    /// @notice Adds a token to an owner's enumeration
    function _addTokenToOwnerEnumeration(address owner, uint256 tokenId) internal {
        _ownedTokensIndex[tokenId] = _ownedTokens[owner].length;
        _ownedTokens[owner].push(tokenId);
    }

    /// @notice Removes a token from an owner's enumeration
    function _removeTokenFromOwnerEnumeration(address owner, uint256 tokenId) internal {
        uint256 lastIndex = _ownedTokens[owner].length - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        if (tokenIndex != lastIndex) {
            uint256 lastTokenId = _ownedTokens[owner][lastIndex];
            _ownedTokens[owner][tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }

        _ownedTokens[owner].pop();
        delete _ownedTokensIndex[tokenId];
    }
}
