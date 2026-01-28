// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC721License
 * @notice Interface for ERC-721 tokens with transferable copyright licenses
 * @dev Third-party marketplaces implement this to ensure license terms are acknowledged
 *
 * When a marketplace detects this interface via supportsInterface(), it should:
 * 1. Display the license terms from licenseURI() to the buyer before purchase
 * 2. Collect the buyer's signature on the licenseHash()
 * 3. Call transferWithLicense() instead of standard transferFrom()
 */
interface IERC721License {

    // ============ License Types ============

    enum LicenseType {
        Display,      // Personal display only
        Commercial,   // Commercial usage rights
        Transfer      // Full copyright transfer
    }

    // ============ Events ============

    /// @notice Emitted when a license is accepted during transfer
    /// @param tokenId The token being transferred
    /// @param from Previous owner
    /// @param to New owner (who accepted the license)
    /// @param licenseHash Hash of the license terms that were accepted
    /// @param signature Buyer's signature proving acceptance
    event LicenseAccepted(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bytes32 licenseHash,
        bytes signature
    );

    // ============ View Functions ============

    /// @notice Get the license type for a token
    /// @param tokenId The token to query
    /// @return The license type (Display, Commercial, or Transfer)
    function licenseType(uint256 tokenId) external view returns (LicenseType);

    /// @notice Get the hash of the license document for a token
    /// @param tokenId The token to query
    /// @return SHA-256 hash of the license terms
    function licenseHash(uint256 tokenId) external view returns (bytes32);

    /// @notice Get the URI of the full license terms
    /// @param tokenId The token to query
    /// @return URI pointing to the license document (e.g., IPFS)
    function licenseURI(uint256 tokenId) external view returns (string memory);

    /// @notice Check if an address has accepted the license for a token
    /// @param tokenId The token to query
    /// @param account The address to check
    /// @return True if the account has accepted the license
    function hasAcceptedLicense(uint256 tokenId, address account) external view returns (bool);

    /// @notice Check if this contract requires license acceptance for transfers
    /// @return True if standard transfers are blocked and transferWithLicense is required
    function requiresLicenseAcceptance() external view returns (bool);

    // ============ Transfer Functions ============

    /// @notice Transfer a token with license acceptance
    /// @dev The signature must be the buyer's signature of the licenseHash
    /// @param from Current owner
    /// @param to New owner
    /// @param tokenId Token to transfer
    /// @param signature Buyer's signature accepting the license terms
    function transferWithLicense(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata signature
    ) external;
}
