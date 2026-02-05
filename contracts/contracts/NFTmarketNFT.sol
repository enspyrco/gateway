// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title NFTmarketNFT V2
 * @notice Upgradeable NFT contract with multi-authority system
 * @dev UUPS proxy pattern with authority-based minting and fee distribution
 *
 * Key features:
 * - UUPS upgradeable proxy pattern
 * - Multi-authority system: third parties can run their own watermarking services
 * - Fee to minter: the wallet that minted a token receives commission on sales
 * - Both seller AND buyer must sign to complete a sale (bilateral agreement)
 * - License rights are tracked per-token and cannot be escalated
 * - Creator always retains Display rights (moral rights)
 * - Anyone who sells Transfer rights retains Display rights
 */
contract NFTmarketNFT is
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable
{
    // ============ Enums ============

    // License hierarchy: Display (0) < Commercial (1) < Transfer (2)
    // You can only sell rights equal to or less than what you have
    enum LicenseType {
        Display,      // Personal display only
        Commercial,   // Commercial usage rights
        Transfer      // Full copyright transfer
    }

    // ============ Structs ============

    struct Authority {
        address admin;           // Can add/remove minters for this authority
        uint96 feeBps;           // Fee in basis points (250 = 2.5%)
        bool isActive;           // Can be deactivated by contract owner
        uint256 registeredAt;    // Timestamp when authority was registered
    }

    struct TokenData {
        address creator;          // Original creator - never changes, always has Display rights
        address copyrightOwner;   // Who owns the copyright - changes on Transfer sales
        LicenseType ownerLicense; // What license the current NFT owner has
        bytes32 imageHash;        // SHA-256 of watermarked image
        uint256 mintedAt;
        string ipfsUri;           // IPFS URI of watermarked image (public)
        uint256 parentToken;      // Token this was licensed from (0 if original)
        uint256 originalToken;    // The root original token in the provenance chain
        bool isOriginal;          // True if this is the original mint, false if license
        uint256 authorityId;      // Which authority minted this token
        address minter;           // Wallet that minted (receives fees on sales)
    }

    struct Reservation {
        address reserver;         // Who reserved this token ID
        uint256 expiry;           // When the reservation expires
    }

    struct Listing {
        address seller;
        uint256 price;
        LicenseType licenseType;
        bytes32 licenseHash;      // SHA-256 of license document
        uint256 nonce;            // Prevents replay attacks
        uint256 expiry;           // Listing expiration timestamp
        bytes sellerSignature;    // Seller's EIP-712 signature
        bool active;
    }

    // ============ EIP-712 Type Hashes ============

    bytes32 public constant LISTING_OFFER_TYPEHASH = keccak256(
        "ListingOffer(uint256 tokenId,uint256 price,uint8 licenseType,bytes32 licenseHash,uint256 nonce,uint256 expiry)"
    );

    bytes32 public constant PURCHASE_ACCEPTANCE_TYPEHASH = keccak256(
        "PurchaseAcceptance(uint256 tokenId,uint256 price,uint8 licenseType,bytes32 licenseHash,address seller,uint256 nonce)"
    );

    // ============ State Variables ============

    uint256 private _nextTokenId;
    uint256 public constant RESERVATION_DURATION = 1 hours;
    uint256 public constant MAX_FEE_BPS = 5000; // 50% max fee cap

    // Authority system
    uint256 private _nextAuthorityId;
    mapping(uint256 => Authority) public authorities;
    mapping(address => uint256) public minterToAuthority;  // minter address => authorityId
    mapping(uint256 => mapping(address => bool)) public authorityMinters;  // authorityId => minter => isMinter

    // Token storage
    mapping(uint256 => TokenData) public tokenData;
    // Multi-license listings: tokenId => licenseType => Listing
    // Allows same token to be listed at different prices for Display, Commercial, Transfer
    mapping(uint256 => mapping(uint8 => Listing)) public listings;
    mapping(bytes32 => bool) public imageHashExists;
    mapping(address => uint256) public nonces;
    mapping(uint256 => Reservation) public reservations;

    // Track who has Display rights (from selling Transfer)
    // tokenId => address => hasDisplayRights
    mapping(uint256 => mapping(address => bool)) public hasDisplayLicense;

    // Pending fees for minters (pull pattern to avoid blocking sales)
    // minter address => pending fee amount
    mapping(address => uint256) public pendingFees;

    // ============ Events ============

    event AuthorityRegistered(
        uint256 indexed authorityId,
        address indexed admin,
        uint96 feeBps
    );

    event AuthorityDeactivated(
        uint256 indexed authorityId
    );

    event AuthorityFeeUpdated(
        uint256 indexed authorityId,
        uint96 oldFeeBps,
        uint96 newFeeBps
    );

    event MinterAdded(
        uint256 indexed authorityId,
        address indexed minter
    );

    event MinterRemoved(
        uint256 indexed authorityId,
        address indexed minter
    );

    event TokenReserved(
        uint256 indexed tokenId,
        address indexed reserver,
        uint256 expiry
    );

    event Minted(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 imageHash,
        uint256 indexed authorityId,
        address minter
    );

    event Listed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        LicenseType licenseType,
        bytes32 licenseHash,
        uint256 nonce,
        uint256 expiry
    );

    event Delisted(
        uint256 indexed tokenId,
        address indexed seller
    );

    event Sold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        LicenseType licenseType,
        bytes32 licenseHash
    );

    event BilateralAgreement(
        uint256 indexed tokenId,
        bytes sellerSignature,
        bytes buyerSignature,
        uint256 timestamp
    );

    event CopyrightTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );

    event DisplayRightsRetained(
        uint256 indexed tokenId,
        address indexed holder
    );

    event LicenseGranted(
        uint256 indexed newTokenId,
        uint256 indexed parentTokenId,
        uint256 indexed originalTokenId,
        address licensor,
        address licensee,
        LicenseType licenseType,
        bytes32 licenseHash
    );

    event FeeAccrued(
        address indexed minter,
        uint256 indexed tokenId,
        uint256 amount
    );

    event FeeWithdrawn(
        address indexed minter,
        uint256 amount
    );

    // ============ Errors ============

    error NoValidReservation();
    error ReservationNotYours();
    error ReservationExpired();
    error ImageAlreadyRegistered();
    error NotTokenOwner();
    error NotListed();
    error AlreadyListed();
    error InsufficientPayment();
    error CannotBuyOwnToken();
    error TransferFailed();
    error InvalidPrice();
    error InvalidSignature();
    error ListingExpired();
    error CannotEscalateRights();
    error LicenseTokensCannotSubLicense();
    error NotAuthorityAdmin();
    error AuthorityNotActive();
    error NotAuthorizedMinter();
    error MinterAlreadyRegistered();
    error MinterNotFound();
    error AuthorityNotFound();
    error FeeTooHigh();
    error NoFeesToWithdraw();

    // ============ Initializer (replaces constructor) ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (called once via proxy)
     * @param owner_ The contract owner (can register new authorities)
     * @param defaultAdmin The admin for Authority 0 (your platform)
     * @param defaultFeeBps The fee for Authority 0 in basis points (e.g., 250 = 2.5%)
     */
    function initialize(
        address owner_,
        address defaultAdmin,
        uint96 defaultFeeBps
    ) public initializer {
        if (defaultFeeBps > MAX_FEE_BPS) {
            revert FeeTooHigh();
        }

        __ERC721_init("NFTmarket", "NFTM");
        __ERC721URIStorage_init();
        __Ownable_init(owner_);
        __ReentrancyGuard_init();
        __EIP712_init("NFTmarket", "1");
        __UUPSUpgradeable_init();

        // Create Authority 0 (your platform) with the specified admin
        authorities[0] = Authority({
            admin: defaultAdmin,
            feeBps: defaultFeeBps,
            isActive: true,
            registeredAt: block.timestamp
        });

        _nextAuthorityId = 1;

        emit AuthorityRegistered(0, defaultAdmin, defaultFeeBps);
    }

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Authority Management ============

    /**
     * @notice Register a new watermarking authority (contract owner only)
     * @param admin The admin address for the new authority
     * @param feeBps Fee in basis points (e.g., 300 = 3.0%, max 5000 = 50%)
     * @return authorityId The new authority's ID
     */
    function registerAuthority(address admin, uint96 feeBps) external onlyOwner returns (uint256) {
        if (feeBps > MAX_FEE_BPS) {
            revert FeeTooHigh();
        }

        uint256 authorityId = _nextAuthorityId++;

        authorities[authorityId] = Authority({
            admin: admin,
            feeBps: feeBps,
            isActive: true,
            registeredAt: block.timestamp
        });

        emit AuthorityRegistered(authorityId, admin, feeBps);
        return authorityId;
    }

    /**
     * @notice Deactivate an authority (contract owner only)
     * @dev Existing tokens remain valid, but no new minting allowed
     * @param authorityId The authority to deactivate
     */
    function deactivateAuthority(uint256 authorityId) external onlyOwner {
        if (authorities[authorityId].registeredAt == 0) {
            revert AuthorityNotFound();
        }
        authorities[authorityId].isActive = false;
        emit AuthorityDeactivated(authorityId);
    }

    /**
     * @notice Update authority fee (authority admin only)
     * @param authorityId The authority to update
     * @param newFeeBps New fee in basis points (max 5000 = 50%)
     */
    function updateAuthorityFee(uint256 authorityId, uint96 newFeeBps) external {
        if (newFeeBps > MAX_FEE_BPS) {
            revert FeeTooHigh();
        }

        Authority storage auth = authorities[authorityId];
        if (auth.admin != msg.sender) {
            revert NotAuthorityAdmin();
        }

        uint96 oldFeeBps = auth.feeBps;
        auth.feeBps = newFeeBps;

        emit AuthorityFeeUpdated(authorityId, oldFeeBps, newFeeBps);
    }

    /**
     * @notice Add a minter to an authority (authority admin only)
     * @param authorityId The authority to add minter to
     * @param minter The wallet address to authorize as minter
     */
    function addMinter(uint256 authorityId, address minter) external {
        Authority storage auth = authorities[authorityId];
        if (auth.admin != msg.sender) {
            revert NotAuthorityAdmin();
        }
        if (!auth.isActive) {
            revert AuthorityNotActive();
        }
        if (minterToAuthority[minter] != 0 || authorityMinters[0][minter]) {
            // Check if already registered to any authority (including authority 0)
            revert MinterAlreadyRegistered();
        }

        authorityMinters[authorityId][minter] = true;
        minterToAuthority[minter] = authorityId;

        emit MinterAdded(authorityId, minter);
    }

    /**
     * @notice Remove a minter from an authority (authority admin only)
     * @param authorityId The authority to remove minter from
     * @param minter The wallet address to remove
     */
    function removeMinter(uint256 authorityId, address minter) external {
        Authority storage auth = authorities[authorityId];
        if (auth.admin != msg.sender) {
            revert NotAuthorityAdmin();
        }
        if (!authorityMinters[authorityId][minter]) {
            revert MinterNotFound();
        }

        authorityMinters[authorityId][minter] = false;
        minterToAuthority[minter] = 0;

        emit MinterRemoved(authorityId, minter);
    }

    /**
     * @notice Get authority details
     * @param authorityId The authority ID to query
     */
    function getAuthority(uint256 authorityId) external view returns (
        address admin,
        uint96 feeBps,
        bool isActive,
        uint256 registeredAt
    ) {
        Authority memory auth = authorities[authorityId];
        return (auth.admin, auth.feeBps, auth.isActive, auth.registeredAt);
    }

    /**
     * @notice Get the authority ID for a minter address
     * @param minter The minter address to query
     * @return authorityId The authority ID (0 if not a minter, but 0 is also valid authority)
     * @return isMinter Whether the address is a registered minter
     */
    function getMinterAuthority(address minter) external view returns (uint256 authorityId, bool isMinter) {
        // Special handling: check if registered to authority 0
        if (authorityMinters[0][minter]) {
            return (0, true);
        }
        uint256 authId = minterToAuthority[minter];
        if (authId != 0) {
            return (authId, true);
        }
        return (0, false);
    }

    // ============ Token Reservation ============

    /**
     * @notice Reserve the next token ID for watermarking
     * @dev Caller must be an authorized minter for an active authority
     * Reservation expires after RESERVATION_DURATION (1 hour)
     * @return tokenId The reserved token ID
     */
    function reserveTokenId() external returns (uint256) {
        // Verify caller is an authorized minter
        uint256 authorityId = minterToAuthority[msg.sender];
        if (!authorityMinters[authorityId][msg.sender]) {
            revert NotAuthorizedMinter();
        }
        if (!authorities[authorityId].isActive) {
            revert AuthorityNotActive();
        }

        uint256 tokenId = _nextTokenId++;
        uint256 expiry = block.timestamp + RESERVATION_DURATION;

        reservations[tokenId] = Reservation({
            reserver: msg.sender,
            expiry: expiry
        });

        emit TokenReserved(tokenId, msg.sender, expiry);
        return tokenId;
    }

    /**
     * @notice Check if a token ID has a valid reservation
     * @param tokenId The token ID to check
     * @return reserver The address that reserved it (address(0) if none)
     * @return expiry The expiration timestamp (0 if none)
     * @return isValid Whether the reservation is still valid
     */
    function getReservation(uint256 tokenId) external view returns (
        address reserver,
        uint256 expiry,
        bool isValid
    ) {
        Reservation memory res = reservations[tokenId];
        return (
            res.reserver,
            res.expiry,
            res.reserver != address(0) && res.expiry >= block.timestamp
        );
    }

    // ============ Minting ============

    /**
     * @notice Mint a new NFT with watermarked artwork
     * @dev Requires a valid reservation from reserveTokenId()
     * @param reservedTokenId The token ID from reserveTokenId()
     * @param to The address to mint to
     * @param uri The metadata URI
     * @param imageHash SHA-256 of the watermarked image
     * @param ipfsUri IPFS URI of the watermarked image
     */
    function mint(
        uint256 reservedTokenId,
        address to,
        string memory uri,
        bytes32 imageHash,
        string memory ipfsUri
    ) external returns (uint256) {
        // Verify reservation
        Reservation storage res = reservations[reservedTokenId];
        if (res.reserver == address(0)) {
            revert NoValidReservation();
        }
        if (res.reserver != msg.sender) {
            revert ReservationNotYours();
        }
        if (res.expiry < block.timestamp) {
            delete reservations[reservedTokenId];
            revert ReservationExpired();
        }

        // Get minter's authority
        uint256 authorityId = minterToAuthority[msg.sender];
        if (!authorityMinters[authorityId][msg.sender]) {
            revert NotAuthorizedMinter();
        }
        if (!authorities[authorityId].isActive) {
            revert AuthorityNotActive();
        }

        // Clear reservation
        delete reservations[reservedTokenId];

        if (imageHashExists[imageHash]) {
            revert ImageAlreadyRegistered();
        }

        uint256 tokenId = reservedTokenId;

        tokenData[tokenId] = TokenData({
            creator: to,
            copyrightOwner: to,           // Creator starts as copyright owner
            ownerLicense: LicenseType.Transfer,  // Creator has full rights
            imageHash: imageHash,
            mintedAt: block.timestamp,
            ipfsUri: ipfsUri,
            parentToken: 0,               // No parent - this is original
            originalToken: tokenId,       // Points to itself
            isOriginal: true,
            authorityId: authorityId,
            minter: msg.sender            // Track who minted (receives fees)
        });

        imageHashExists[imageHash] = true;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit Minted(tokenId, to, imageHash, authorityId, msg.sender);

        return tokenId;
    }

    // ============ Marketplace ============

    /**
     * @notice List a token for sale with seller's signed commitment
     * @dev Cannot offer more rights than you currently have
     *      Multi-license: can list same token at different prices for Display, Commercial, Transfer
     */
    function list(
        uint256 tokenId,
        uint256 price,
        LicenseType licenseType,
        bytes32 licenseHash,
        uint256 expiry,
        bytes calldata signature
    ) external {
        if (ownerOf(tokenId) != msg.sender) {
            revert NotTokenOwner();
        }
        // Check if THIS license type is already listed (allows multiple license types)
        if (listings[tokenId][uint8(licenseType)].active) {
            revert AlreadyListed();
        }
        if (price == 0) {
            revert InvalidPrice();
        }
        if (expiry != 0 && expiry <= block.timestamp) {
            revert ListingExpired();
        }

        // License tokens (non-original) cannot sub-license
        // They can only be sold via Transfer (which transfers the token itself)
        if (!tokenData[tokenId].isOriginal) {
            if (licenseType != LicenseType.Transfer) {
                revert LicenseTokensCannotSubLicense();
            }
            // When selling a license token via Transfer, buyer gets the token's current license
            // No need to check CannotEscalateRights - the token's license level is preserved
        } else {
            // Original tokens: cannot sell more rights than you have
            if (licenseType > tokenData[tokenId].ownerLicense) {
                revert CannotEscalateRights();
            }
        }

        uint256 nonce = nonces[msg.sender]++;

        // Verify seller's signature
        bytes32 structHash = keccak256(abi.encode(
            LISTING_OFFER_TYPEHASH,
            tokenId,
            price,
            uint8(licenseType),
            licenseHash,
            nonce,
            expiry
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != msg.sender) {
            revert InvalidSignature();
        }

        listings[tokenId][uint8(licenseType)] = Listing({
            seller: msg.sender,
            price: price,
            licenseType: licenseType,
            licenseHash: licenseHash,
            nonce: nonce,
            expiry: expiry,
            sellerSignature: signature,
            active: true
        });

        emit Listed(tokenId, msg.sender, price, licenseType, licenseHash, nonce, expiry);
    }

    /**
     * @notice Remove a specific license type listing
     * @param tokenId The token to delist
     * @param licenseType Which license type listing to remove
     */
    function delist(uint256 tokenId, LicenseType licenseType) external {
        Listing storage listing = listings[tokenId][uint8(licenseType)];

        if (!listing.active) {
            revert NotListed();
        }
        if (listing.seller != msg.sender) {
            revert NotTokenOwner();
        }

        listing.active = false;

        emit Delisted(tokenId, msg.sender);
    }

    /**
     * @notice Remove all listings for a token
     * @param tokenId The token to delist completely
     */
    function delistAll(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) {
            revert NotTokenOwner();
        }

        bool anyDelisted = false;
        for (uint8 i = 0; i <= uint8(LicenseType.Transfer); i++) {
            if (listings[tokenId][i].active) {
                listings[tokenId][i].active = false;
                anyDelisted = true;
            }
        }

        if (!anyDelisted) {
            revert NotListed();
        }

        emit Delisted(tokenId, msg.sender);
    }

    /**
     * @notice Buy a listed token with buyer's signed acceptance
     * @dev Handles license transfer and retention of Display rights
     * @param tokenId The token to buy
     * @param licenseType Which license type listing to purchase
     * @param signature Buyer's EIP-712 signature
     */
    function buy(uint256 tokenId, LicenseType licenseType, bytes calldata signature) external payable nonReentrant {
        Listing storage listing = listings[tokenId][uint8(licenseType)];

        if (!listing.active) {
            revert NotListed();
        }
        if (listing.expiry != 0 && block.timestamp > listing.expiry) {
            listing.active = false;
            revert ListingExpired();
        }
        if (msg.value < listing.price) {
            revert InsufficientPayment();
        }
        if (msg.sender == listing.seller) {
            revert CannotBuyOwnToken();
        }

        // Verify buyer's signature
        bytes32 structHash = keccak256(abi.encode(
            PURCHASE_ACCEPTANCE_TYPEHASH,
            tokenId,
            listing.price,
            uint8(listing.licenseType),
            listing.licenseHash,
            listing.seller,
            listing.nonce
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != msg.sender) {
            revert InvalidSignature();
        }

        address seller = listing.seller;
        uint256 price = listing.price;
        bytes32 licenseHash = listing.licenseHash;
        bytes memory sellerSig = listing.sellerSignature;

        // Clear this listing before transfers
        listing.active = false;

        // Calculate and distribute payments (fee goes to token's minter)
        _distributePayment(seller, price, tokenId);

        TokenData storage data = tokenData[tokenId];

        if (!data.isOriginal) {
            // License token sale: just transfer the token, buyer gets current license level
            // No copyright transfer, no new rights - just change of ownership
            // Also clear any other listings since token ownership is changing
            _clearAllListings(tokenId);
            _transfer(seller, msg.sender, tokenId);
            emit Sold(tokenId, seller, msg.sender, price, data.ownerLicense, licenseHash);
        } else if (licenseType == LicenseType.Transfer) {
            // Original token Transfer sale: actual token transfer with copyright
            // Clear all listings since token ownership is changing
            _clearAllListings(tokenId);
            _transferLicenseRights(tokenId, seller, msg.sender, licenseType);
            _transfer(seller, msg.sender, tokenId);
            emit Sold(tokenId, seller, msg.sender, price, licenseType, licenseHash);
        } else {
            // Original token Display/Commercial sale: mint new license token for buyer
            // Original token stays with seller who keeps copyright
            // Other listings remain active (seller can still sell other license types)
            uint256 newTokenId = _mintLicenseToken(tokenId, msg.sender, licenseType, licenseHash);
            emit LicenseGranted(newTokenId, tokenId, data.originalToken, seller, msg.sender, licenseType, licenseHash);
        }

        // Refund excess
        if (msg.value > price) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - price}("");
            if (!refundSuccess) revert TransferFailed();
        }

        emit BilateralAgreement(tokenId, sellerSig, signature, block.timestamp);
    }

    /**
     * @notice Clear all listings for a token (internal helper)
     */
    function _clearAllListings(uint256 tokenId) internal {
        for (uint8 i = 0; i <= uint8(LicenseType.Transfer); i++) {
            listings[tokenId][i].active = false;
        }
    }

    /**
     * @notice Mint a new license token (for Display/Commercial sales)
     * @dev Creates new token linked to parent, buyer gets the license token
     */
    function _mintLicenseToken(
        uint256 parentTokenId,
        address licensee,
        LicenseType licenseType,
        bytes32 /* licenseHash - used in event emission by caller */
    ) internal returns (uint256) {
        TokenData storage parentData = tokenData[parentTokenId];

        uint256 newTokenId = _nextTokenId++;

        // License token inherits image data from parent but has its own license level
        tokenData[newTokenId] = TokenData({
            creator: parentData.creator,           // Original creator preserved
            copyrightOwner: parentData.copyrightOwner, // Copyright stays with original owner
            ownerLicense: licenseType,             // License level purchased
            imageHash: parentData.imageHash,       // Same image
            mintedAt: block.timestamp,
            ipfsUri: parentData.ipfsUri,           // Same IPFS image
            parentToken: parentTokenId,            // Direct parent in license chain
            originalToken: parentData.originalToken, // Root of provenance chain
            isOriginal: false,                     // This is a license, not original
            authorityId: parentData.authorityId,   // Inherit authority from parent
            minter: parentData.minter              // Inherit minter from parent (fees still go to original minter)
        });

        _safeMint(licensee, newTokenId);
        _setTokenURI(newTokenId, tokenURI(parentTokenId));

        return newTokenId;
    }

    /**
     * @notice Handle license rights transfer based on sale type (Transfer only)
     */
    function _transferLicenseRights(
        uint256 tokenId,
        address seller,
        address buyer,
        LicenseType /* licenseType - always Transfer when this is called */
    ) internal {
        TokenData storage data = tokenData[tokenId];

        // This function is now only called for Transfer sales
        // Seller is transferring copyright
        // Seller retains Display rights
        hasDisplayLicense[tokenId][seller] = true;
        emit DisplayRightsRetained(tokenId, seller);

        // Buyer becomes new copyright owner with Transfer rights
        address previousCopyrightOwner = data.copyrightOwner;
        data.copyrightOwner = buyer;
        data.ownerLicense = LicenseType.Transfer;

        emit CopyrightTransferred(tokenId, previousCopyrightOwner, buyer);
    }

    /**
     * @notice Distribute payment to minter (fee via pull) and seller (proceeds)
     * @dev Fee is accrued for the minter to withdraw later (pull pattern)
     *      This prevents sales from being blocked if minter contract rejects ETH
     */
    function _distributePayment(
        address seller,
        uint256 price,
        uint256 tokenId
    ) internal {
        TokenData storage token = tokenData[tokenId];
        Authority storage auth = authorities[token.authorityId];

        uint256 fee = (price * auth.feeBps) / 10000;
        uint256 sellerProceeds = price - fee;

        // Accrue fee for minter to withdraw later (pull pattern)
        // This prevents blocking sales if minter is a contract that rejects ETH
        pendingFees[token.minter] += fee;
        emit FeeAccrued(token.minter, tokenId, fee);

        // Pay seller immediately
        (bool sellerSuccess, ) = seller.call{value: sellerProceeds}("");
        if (!sellerSuccess) revert TransferFailed();
    }

    /**
     * @notice Withdraw accumulated fees (for minters)
     * @dev Pull pattern - minters call this to collect their fees
     */
    function withdrawFees() external nonReentrant {
        uint256 amount = pendingFees[msg.sender];
        if (amount == 0) {
            revert NoFeesToWithdraw();
        }

        // Clear before transfer (checks-effects-interactions)
        pendingFees[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit FeeWithdrawn(msg.sender, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get full token data including license info and provenance
     */
    function getTokenData(uint256 tokenId) external view returns (
        address creator,
        address currentOwner,
        address copyrightOwner,
        LicenseType ownerLicense,
        bytes32 imageHash,
        uint256 mintedAt,
        string memory ipfsUri,
        string memory uri,
        uint256 parentToken,
        uint256 originalToken,
        bool isOriginal,
        uint256 authorityId,
        address minter
    ) {
        TokenData memory data = tokenData[tokenId];
        return (
            data.creator,
            ownerOf(tokenId),
            data.copyrightOwner,
            data.ownerLicense,
            data.imageHash,
            data.mintedAt,
            data.ipfsUri,
            tokenURI(tokenId),
            data.parentToken,
            data.originalToken,
            data.isOriginal,
            data.authorityId,
            data.minter
        );
    }

    /**
     * @notice Get provenance chain for a token
     * @dev Returns array of token IDs from current token back to original
     */
    function getProvenanceChain(uint256 tokenId) external view returns (uint256[] memory) {
        // Count chain length first
        uint256 length = 1;
        uint256 current = tokenId;
        while (!tokenData[current].isOriginal && tokenData[current].parentToken != current) {
            current = tokenData[current].parentToken;
            length++;
            // Safety limit to prevent infinite loops
            if (length > 1000) break;
        }

        // Build chain array
        uint256[] memory chain = new uint256[](length);
        current = tokenId;
        for (uint256 i = 0; i < length; i++) {
            chain[i] = current;
            if (!tokenData[current].isOriginal) {
                current = tokenData[current].parentToken;
            }
        }

        return chain;
    }

    /**
     * @notice Get listing info for a specific license type
     * @param tokenId The token to query
     * @param licenseType Which license type listing to get
     */
    function getListing(uint256 tokenId, LicenseType licenseType) external view returns (
        address seller,
        uint256 price,
        bytes32 licenseHash,
        uint256 nonce,
        uint256 expiry,
        bool active
    ) {
        Listing memory listing = listings[tokenId][uint8(licenseType)];
        return (
            listing.seller,
            listing.price,
            listing.licenseHash,
            listing.nonce,
            listing.expiry,
            listing.active
        );
    }

    /**
     * @notice Get all active listings for a token
     * @param tokenId The token to query
     * @return displayPrice Price for Display license (0 if not listed)
     * @return displayActive Whether Display license is actively listed
     * @return commercialPrice Price for Commercial license (0 if not listed)
     * @return commercialActive Whether Commercial license is actively listed
     * @return transferPrice Price for full Transfer (0 if not listed)
     * @return transferActive Whether Transfer is actively listed
     */
    function getAllListings(uint256 tokenId) external view returns (
        uint256 displayPrice,
        bool displayActive,
        uint256 commercialPrice,
        bool commercialActive,
        uint256 transferPrice,
        bool transferActive
    ) {
        Listing memory display = listings[tokenId][uint8(LicenseType.Display)];
        Listing memory commercial = listings[tokenId][uint8(LicenseType.Commercial)];
        Listing memory transfer = listings[tokenId][uint8(LicenseType.Transfer)];

        return (
            display.price,
            display.active,
            commercial.price,
            commercial.active,
            transfer.price,
            transfer.active
        );
    }

    /**
     * @notice Get the seller's signature for a listing
     * @param tokenId The token to query
     * @param licenseType Which license type listing to get signature for
     */
    function getListingSignature(uint256 tokenId, LicenseType licenseType) external view returns (bytes memory) {
        return listings[tokenId][uint8(licenseType)].sellerSignature;
    }

    /**
     * @notice Check if an address has Display rights for a token
     * @dev Creator always has Display rights. Others get it by selling Transfer.
     */
    function checkDisplayRights(uint256 tokenId, address account) external view returns (bool) {
        // Creator always has display rights (moral rights)
        if (tokenData[tokenId].creator == account) {
            return true;
        }

        // Current owner always has at least display rights
        if (ownerOf(tokenId) == account) {
            return true;
        }

        // Check if they retained display rights from selling Transfer
        return hasDisplayLicense[tokenId][account];
    }

    /**
     * @notice Check if an address has Commercial rights for a token
     */
    function checkCommercialRights(uint256 tokenId, address account) external view returns (bool) {
        // Copyright owner has commercial rights
        if (tokenData[tokenId].copyrightOwner == account) {
            return true;
        }

        // Current owner has commercial rights if their license is Commercial or Transfer
        if (ownerOf(tokenId) == account) {
            return tokenData[tokenId].ownerLicense >= LicenseType.Commercial;
        }

        return false;
    }

    /**
     * @notice Check if an address owns the copyright
     */
    function checkCopyrightOwnership(uint256 tokenId, address account) external view returns (bool) {
        return tokenData[tokenId].copyrightOwner == account;
    }

    /**
     * @notice Get the maximum license type the current owner can sell
     */
    function getMaxSellableLicense(uint256 tokenId) external view returns (LicenseType) {
        return tokenData[tokenId].ownerLicense;
    }

    /**
     * @notice Check if an image hash is already registered
     */
    function isImageRegistered(bytes32 imageHash) external view returns (bool) {
        return imageHashExists[imageHash];
    }

    /**
     * @notice Get total supply
     */
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @notice Get current nonce for an address
     */
    function getNonce(address account) external view returns (uint256) {
        return nonces[account];
    }

    /**
     * @notice Get the EIP-712 domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Get total number of authorities
     */
    function totalAuthorities() external view returns (uint256) {
        return _nextAuthorityId;
    }

    // ============ Overrides ============

    function tokenURI(uint256 tokenId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Auto-delist all license types when transferred outside marketplace
        if (from != address(0)) {
            bool anyDelisted = false;
            for (uint8 i = 0; i <= uint8(LicenseType.Transfer); i++) {
                if (listings[tokenId][i].active) {
                    listings[tokenId][i].active = false;
                    anyDelisted = true;
                }
            }
            if (anyDelisted) {
                emit Delisted(tokenId, from);
            }
        }

        return from;
    }

    // ============ Storage Gap for Upgrades ============

    /**
     * @dev Reserved storage space for future upgrades
     * This allows adding new state variables without colliding with child contract storage
     */
    uint256[50] private __gap;
}
