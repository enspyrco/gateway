// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title INFTLicensing
/// @notice Interface for the NFT Licensing System
interface INFTLicensing {
    // ============ Enums ============

    /// @notice Types of licenses available
    enum LicenseType {
        Copyright,   // 0x00 - Full copyright ownership
        Commercial,  // 0x01 - Commercial usage rights
        Display      // 0x02 - Display-only rights
    }

    /// @notice Retention options when transferring copyright
    enum RetentionType {
        None,        // No license retained
        Commercial,  // Retain commercial license
        Display      // Retain display license
    }

    // ============ Structs ============

    /// @notice Core artwork data
    struct Artwork {
        address originalMinter;      // Permanent watermark - never changes
        uint88 commercialCount;      // Number of commercial licenses minted
        uint88 displayCount;         // Number of display licenses minted
        bool copyrightTransferred;   // True once copyright has been transferred
        string metadataURI;          // IPFS or other URI for artwork metadata
    }

    /// @notice Marketplace listing for a token
    struct Listing {
        uint256 askingPrice;         // Asking price in wei
        bool isActive;               // Whether the listing is active
    }

    /// @notice Offer made on a token
    struct Offer {
        address offerer;             // Address of the offerer
        uint256 amount;              // Amount locked in contract (wei)
        bool isActive;               // Whether the offer is still active
    }

    /// @notice License information for a specific token
    struct LicenseInfo {
        uint160 artworkId;           // The artwork this license belongs to
        LicenseType licenseType;     // Type of license
        bool isOriginalGrant;        // True if minted by copyright owner (unlimited resale)
        uint88 instanceId;           // Instance number for this license type
    }

    // ============ Events ============

    /// @notice Emitted when a new artwork is created
    event ArtworkCreated(
        uint160 indexed artworkId,
        address indexed originalMinter,
        string metadataURI
    );

    /// @notice Emitted when a license is minted
    event LicenseMinted(
        uint256 indexed tokenId,
        uint160 indexed artworkId,
        LicenseType licenseType,
        address indexed to,
        uint88 instanceId
    );

    /// @notice Emitted when copyright is transferred
    event CopyrightTransferred(
        uint160 indexed artworkId,
        address indexed from,
        address indexed to,
        RetentionType retention
    );

    /// @notice Emitted for provenance tracking on any license transfer
    event LicenseTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bool isFirstTransfer
    );

    /// @notice Emitted when a token is listed for sale
    event Listed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 askingPrice
    );

    /// @notice Emitted when a listing is cancelled
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);

    /// @notice Emitted when an offer is made
    event OfferMade(
        uint256 indexed tokenId,
        address indexed offerer,
        uint256 amount,
        uint256 offerIndex
    );

    /// @notice Emitted when an offer is accepted
    event OfferAccepted(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 amount
    );

    /// @notice Emitted when an offer is rejected
    event OfferRejected(
        uint256 indexed tokenId,
        address indexed offerer,
        uint256 amount
    );

    /// @notice Emitted when an offer is withdrawn
    event OfferWithdrawn(
        uint256 indexed tokenId,
        address indexed offerer,
        uint256 amount
    );

    // ============ Errors ============

    error NotCopyrightOwner();
    error CopyrightAlreadyTransferred();
    error InvalidLicenseType();
    error ArtworkDoesNotExist();
    error TransferNotAllowed();
    error AlreadyResold();
    error ZeroAddress();
    error NotTokenOwner();
    error NotListed();
    error AlreadyListed();
    error InvalidOffer();
    error OfferNotActive();
    error NotOfferer();
    error InsufficientFunds();
    error TransferFailed();
    error NoFundsToWithdraw();

    // ============ Functions ============

    /// @notice Creates a new artwork and mints the copyright token to the caller
    /// @param metadataURI The URI for artwork metadata (contains title, image, etc.)
    /// @return artworkId The unique identifier for the artwork
    function createArtwork(string calldata metadataURI) external returns (uint160 artworkId);

    /// @notice Mints a license token (only callable by copyright owner)
    /// @param artworkId The artwork to mint a license for
    /// @param licenseType The type of license to mint
    /// @param to The recipient of the license
    /// @return tokenId The minted token ID
    function mintLicense(
        uint160 artworkId,
        LicenseType licenseType,
        address to
    ) external returns (uint256 tokenId);

    /// @notice Transfers copyright with optional license retention
    /// @param artworkId The artwork to transfer copyright for
    /// @param to The new copyright owner
    /// @param retention The type of license to retain (if any)
    function transferCopyrightWithRetention(
        uint160 artworkId,
        address to,
        RetentionType retention
    ) external;

    /// @notice Gets artwork information
    /// @param artworkId The artwork ID
    /// @return The artwork data
    function getArtwork(uint160 artworkId) external view returns (Artwork memory);

    /// @notice Gets license information for a token
    /// @param tokenId The token ID
    /// @return The license info
    function getLicenseInfo(uint256 tokenId) external view returns (LicenseInfo memory);

    /// @notice Gets the original minter (watermark) for an artwork
    /// @param artworkId The artwork ID
    /// @return The original minter's address
    function getOriginalMinter(uint160 artworkId) external view returns (address);

    /// @notice Checks if a token holder can transfer their token
    /// @param tokenId The token ID
    /// @return True if transfer is allowed
    function canTransfer(uint256 tokenId) external view returns (bool);

    // ============ Marketplace Functions ============

    /// @notice Lists a token for sale
    /// @param tokenId The token to list
    /// @param askingPrice The asking price in wei
    function listForSale(uint256 tokenId, uint256 askingPrice) external;

    /// @notice Cancels an active listing
    /// @param tokenId The token to unlist
    function cancelListing(uint256 tokenId) external;

    /// @notice Makes an offer on a listed token
    /// @param tokenId The token to make an offer on
    function makeOffer(uint256 tokenId) external payable;

    /// @notice Accepts an offer on your token
    /// @param tokenId The token with the offer
    /// @param offerIndex The index of the offer to accept
    function acceptOffer(uint256 tokenId, uint256 offerIndex) external;

    /// @notice Rejects an offer on your token
    /// @param tokenId The token with the offer
    /// @param offerIndex The index of the offer to reject
    function rejectOffer(uint256 tokenId, uint256 offerIndex) external;

    /// @notice Withdraws your own offer
    /// @param tokenId The token with your offer
    /// @param offerIndex The index of your offer
    function withdrawOffer(uint256 tokenId, uint256 offerIndex) external;

    /// @notice Withdraws accumulated funds from rejected/outbid offers
    function withdraw() external;

    /// @notice Gets all active listings
    /// @return tokenIds Array of token IDs with active listings
    /// @return listingData Array of corresponding listing data
    function getListings() external view returns (uint256[] memory tokenIds, Listing[] memory listingData);

    /// @notice Gets all offers on a token
    /// @param tokenId The token to get offers for
    /// @return Array of offers
    function getOffers(uint256 tokenId) external view returns (Offer[] memory);

    /// @notice Gets all tokens owned by an address
    /// @param owner The address to query
    /// @return Array of token IDs
    function getOwnedTokens(address owner) external view returns (uint256[] memory);

    /// @notice Gets the listing for a token
    /// @param tokenId The token to query
    /// @return The listing data
    function getListing(uint256 tokenId) external view returns (Listing memory);

    /// @notice Gets pending withdrawals for an address
    /// @param user The address to query
    /// @return Amount available to withdraw
    function getPendingWithdrawals(address user) external view returns (uint256);
}
