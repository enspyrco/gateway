// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title NFTmarketNFT
 * @notice NFT contract for NFTmarket AI art marketplace with watermark verification
 * @dev ERC721 with license types, marketplace, and bilateral signatures
 *
 * Key features:
 * - Both seller AND buyer must sign to complete a sale (bilateral agreement)
 * - License rights are tracked per-token and cannot be escalated
 * - Creator always retains Display rights (moral rights)
 * - Anyone who sells Transfer rights retains Display rights
 */
contract NFTmarketNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard, EIP712 {

    // ============ Enums ============

    // License hierarchy: Display (0) < Commercial (1) < Transfer (2)
    // You can only sell rights equal to or less than what you have
    enum LicenseType {
        Display,      // Personal display only
        Commercial,   // Commercial usage rights
        Transfer      // Full copyright transfer
    }

    // ============ Structs ============

    struct TokenData {
        address creator;          // Original creator - never changes, always has Display rights
        address copyrightOwner;   // Who owns the copyright - changes on Transfer sales
        LicenseType ownerLicense; // What license the current NFT owner has
        bytes32 imageHash;        // SHA-256 of original image
        uint256 mintedAt;
        string encryptedBlobUri;  // IPFS URI of encrypted original
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
    uint96 public constant PLATFORM_FEE_BPS = 250; // 2.5% platform fee

    mapping(uint256 => TokenData) public tokenData;
    mapping(uint256 => Listing) public listings;
    mapping(bytes32 => bool) public imageHashExists;
    mapping(address => uint256) public nonces;

    // Track who has Display rights (from selling Transfer)
    // tokenId => address => hasDisplayRights
    mapping(uint256 => mapping(address => bool)) public hasDisplayLicense;

    address public platformWallet;

    // ============ Events ============

    event Minted(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 imageHash
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

    // ============ Errors ============

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

    // ============ Constructor ============

    constructor(address _platformWallet)
        ERC721("NFTmarket", "NFTM")
        EIP712("NFTmarket", "1")
        Ownable(msg.sender)
    {
        platformWallet = _platformWallet;
    }

    // ============ Minting ============

    /**
     * @notice Mint a new NFT with watermarked artwork
     * @dev Creator starts with Transfer rights (full copyright)
     */
    function mint(
        address to,
        string memory uri,
        bytes32 imageHash,
        string memory encryptedBlobUri
    ) external returns (uint256) {
        if (imageHashExists[imageHash]) {
            revert ImageAlreadyRegistered();
        }

        uint256 tokenId = _nextTokenId++;

        tokenData[tokenId] = TokenData({
            creator: to,
            copyrightOwner: to,           // Creator starts as copyright owner
            ownerLicense: LicenseType.Transfer,  // Creator has full rights
            imageHash: imageHash,
            mintedAt: block.timestamp,
            encryptedBlobUri: encryptedBlobUri
        });

        imageHashExists[imageHash] = true;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit Minted(tokenId, to, imageHash);

        return tokenId;
    }

    // ============ Marketplace ============

    /**
     * @notice List a token for sale with seller's signed commitment
     * @dev Cannot offer more rights than you currently have
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
        if (listings[tokenId].active) {
            revert AlreadyListed();
        }
        if (price == 0) {
            revert InvalidPrice();
        }
        if (expiry != 0 && expiry <= block.timestamp) {
            revert ListingExpired();
        }

        // Cannot sell more rights than you have
        if (licenseType > tokenData[tokenId].ownerLicense) {
            revert CannotEscalateRights();
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

        listings[tokenId] = Listing({
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
     * @notice Remove a listing
     */
    function delist(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];

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
     * @notice Buy a listed token with buyer's signed acceptance
     * @dev Handles license transfer and retention of Display rights
     */
    function buy(uint256 tokenId, bytes calldata signature) external payable nonReentrant {
        Listing storage listing = listings[tokenId];

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
        LicenseType licenseType = listing.licenseType;
        bytes32 licenseHash = listing.licenseHash;
        bytes memory sellerSig = listing.sellerSignature;

        // Clear listing before transfers
        listing.active = false;

        // Handle license rights transfer
        _transferLicenseRights(tokenId, seller, msg.sender, licenseType);

        // Calculate and distribute payments
        _distributePayment(seller, price);

        // Transfer NFT
        _transfer(seller, msg.sender, tokenId);

        // Refund excess
        if (msg.value > price) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - price}("");
            if (!refundSuccess) revert TransferFailed();
        }

        emit Sold(tokenId, seller, msg.sender, price, licenseType, licenseHash);
        emit BilateralAgreement(tokenId, sellerSig, signature, block.timestamp);
    }

    /**
     * @notice Handle license rights transfer based on sale type
     */
    function _transferLicenseRights(
        uint256 tokenId,
        address seller,
        address buyer,
        LicenseType licenseType
    ) internal {
        TokenData storage data = tokenData[tokenId];

        if (licenseType == LicenseType.Transfer) {
            // Seller is transferring copyright
            // Seller retains Display rights
            hasDisplayLicense[tokenId][seller] = true;
            emit DisplayRightsRetained(tokenId, seller);

            // Buyer becomes new copyright owner with Transfer rights
            address previousCopyrightOwner = data.copyrightOwner;
            data.copyrightOwner = buyer;
            data.ownerLicense = LicenseType.Transfer;

            emit CopyrightTransferred(tokenId, previousCopyrightOwner, buyer);
        } else {
            // Seller is licensing, not transferring copyright
            // Buyer gets the license they paid for
            data.ownerLicense = licenseType;

            // Copyright owner doesn't change
            // (buyer has license, not ownership)
        }
    }

    /**
     * @notice Distribute payment to platform and seller
     */
    function _distributePayment(
        address seller,
        uint256 price
    ) internal {
        uint256 platformFee = (price * PLATFORM_FEE_BPS) / 10000;
        uint256 sellerProceeds = price - platformFee;

        // Pay platform
        (bool platformSuccess, ) = platformWallet.call{value: platformFee}("");
        if (!platformSuccess) revert TransferFailed();

        // Pay seller
        (bool sellerSuccess, ) = seller.call{value: sellerProceeds}("");
        if (!sellerSuccess) revert TransferFailed();
    }

    // ============ View Functions ============

    /**
     * @notice Get full token data including license info
     */
    function getTokenData(uint256 tokenId) external view returns (
        address creator,
        address currentOwner,
        address copyrightOwner,
        LicenseType ownerLicense,
        bytes32 imageHash,
        uint256 mintedAt,
        string memory encryptedBlobUri,
        string memory uri
    ) {
        TokenData memory data = tokenData[tokenId];
        return (
            data.creator,
            ownerOf(tokenId),
            data.copyrightOwner,
            data.ownerLicense,
            data.imageHash,
            data.mintedAt,
            data.encryptedBlobUri,
            tokenURI(tokenId)
        );
    }

    /**
     * @notice Get listing info
     */
    function getListing(uint256 tokenId) external view returns (
        address seller,
        uint256 price,
        LicenseType licenseType,
        bytes32 licenseHash,
        uint256 nonce,
        uint256 expiry,
        bool active
    ) {
        Listing memory listing = listings[tokenId];
        return (
            listing.seller,
            listing.price,
            listing.licenseType,
            listing.licenseHash,
            listing.nonce,
            listing.expiry,
            listing.active
        );
    }

    /**
     * @notice Get the seller's signature for a listing
     */
    function getListingSignature(uint256 tokenId) external view returns (bytes memory) {
        return listings[tokenId].sellerSignature;
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

    // ============ Admin Functions ============

    function setPlatformWallet(address _platformWallet) external onlyOwner {
        platformWallet = _platformWallet;
    }

    // ============ Overrides ============

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Auto-delist when transferred outside marketplace
        if (listings[tokenId].active && from != address(0)) {
            listings[tokenId].active = false;
            emit Delisted(tokenId, from);
        }

        return from;
    }
}
