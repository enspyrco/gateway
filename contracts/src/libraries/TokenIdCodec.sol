// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TokenIdCodec
/// @notice Library for encoding and decoding token IDs
/// @dev Token ID structure (256 bits total):
///      - Artwork ID: 160 bits (positions 96-255)
///      - License Type: 8 bits (positions 88-95)
///      - Instance ID: 88 bits (positions 0-87)
library TokenIdCodec {
    uint256 internal constant ARTWORK_ID_SHIFT = 96;
    uint256 internal constant LICENSE_TYPE_SHIFT = 88;
    uint256 internal constant ARTWORK_ID_MASK = type(uint160).max;
    uint256 internal constant LICENSE_TYPE_MASK = type(uint8).max;
    uint256 internal constant INSTANCE_ID_MASK = type(uint88).max;

    /// @notice Encodes artwork ID, license type, and instance ID into a token ID
    /// @param artworkId The unique identifier for the artwork (160 bits)
    /// @param licenseType The type of license (0=Copyright, 1=Commercial, 2=Display)
    /// @param instanceId The instance number for this license type (88 bits)
    /// @return tokenId The encoded token ID
    function encode(
        uint160 artworkId,
        uint8 licenseType,
        uint88 instanceId
    ) internal pure returns (uint256 tokenId) {
        tokenId = (uint256(artworkId) << ARTWORK_ID_SHIFT)
                | (uint256(licenseType) << LICENSE_TYPE_SHIFT)
                | uint256(instanceId);
    }

    /// @notice Decodes a token ID into its components
    /// @param tokenId The token ID to decode
    /// @return artworkId The artwork identifier
    /// @return licenseType The license type
    /// @return instanceId The instance number
    function decode(uint256 tokenId)
        internal
        pure
        returns (uint160 artworkId, uint8 licenseType, uint88 instanceId)
    {
        artworkId = uint160((tokenId >> ARTWORK_ID_SHIFT) & ARTWORK_ID_MASK);
        licenseType = uint8((tokenId >> LICENSE_TYPE_SHIFT) & LICENSE_TYPE_MASK);
        instanceId = uint88(tokenId & INSTANCE_ID_MASK);
    }

    /// @notice Extracts the artwork ID from a token ID
    /// @param tokenId The token ID
    /// @return The artwork ID
    function getArtworkId(uint256 tokenId) internal pure returns (uint160) {
        return uint160((tokenId >> ARTWORK_ID_SHIFT) & ARTWORK_ID_MASK);
    }

    /// @notice Extracts the license type from a token ID
    /// @param tokenId The token ID
    /// @return The license type
    function getLicenseType(uint256 tokenId) internal pure returns (uint8) {
        return uint8((tokenId >> LICENSE_TYPE_SHIFT) & LICENSE_TYPE_MASK);
    }

    /// @notice Extracts the instance ID from a token ID
    /// @param tokenId The token ID
    /// @return The instance ID
    function getInstanceId(uint256 tokenId) internal pure returns (uint88) {
        return uint88(tokenId & INSTANCE_ID_MASK);
    }

    /// @notice Creates the copyright token ID for an artwork (license type 0, instance 0)
    /// @param artworkId The artwork identifier
    /// @return The copyright token ID
    function copyrightTokenId(uint160 artworkId) internal pure returns (uint256) {
        return encode(artworkId, 0, 0);
    }
}
