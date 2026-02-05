# Token ID Reservation System

## Problem

NFTmarket embeds a watermark ID (`walletAddress:tokenId`) into images before minting. This creates a chicken-and-egg problem: we need to know the token ID before minting, but the token ID is assigned during minting.

The original approach predicted the token ID by reading `totalSupply()` and assuming the next mint would get that ID. This worked in local development but fails on real blockchains because:

1. **Concurrent mints** - Another user could mint between your `totalSupply()` read and your mint transaction
2. **Multiple backend instances** - Horizontal scaling means multiple backends could predict the same ID
3. **Transaction reordering** - Validators can order transactions differently than submission order

If the predicted ID doesn't match the actual minted ID, the watermark becomes invalid.

## Solution

The contract now uses a **reservation system** that atomically reserves a token ID before watermarking:

```
Old flow (broken):
  totalSupply() → predict ID → watermark → mint → hope IDs match

New flow (guaranteed):
  reserveTokenId() → get guaranteed ID → watermark → mint(reservedId) → IDs always match
```

## Contract Functions

### `reserveTokenId()`

Reserves the next token ID for the caller.

```solidity
function reserveTokenId() external returns (uint256)
```

- Increments `_nextTokenId` and assigns it to the caller
- Reservation expires after 1 hour (`RESERVATION_DURATION`)
- Emits `TokenReserved(tokenId, reserver, expiry)`
- Returns the reserved token ID

### `getReservation(uint256 tokenId)`

Check if a token ID has a valid reservation.

```solidity
function getReservation(uint256 tokenId) external view returns (
    address reserver,
    uint256 expiry,
    bool isValid
)
```

### `mint(uint256 reservedTokenId, address to, ...)`

Mint requires a valid reservation:

```solidity
function mint(
    uint256 reservedTokenId,
    address to,
    string memory uri,
    bytes32 imageHash,
    string memory ipfsUri,
    string memory encryptedBlobUri
) external returns (uint256)
```

- Verifies `reservedTokenId` has a valid, non-expired reservation
- Verifies caller is the one who made the reservation
- Clears the reservation and mints the token

## Backend Flow

The mint route (`/api/mint`) now:

1. **Reserve on-chain**
   ```javascript
   const reservation = await blockchainService.reserveTokenId();
   // reservation.tokenId is guaranteed to be ours
   ```

2. **Watermark with reserved ID**
   ```javascript
   const watermarkId = `${wallet}:${reservation.tokenId}`;
   const watermarked = await watermarkService.applyWatermark(image, wallet, reservation.tokenId);
   ```

3. **Upload to IPFS/Arweave** (with correct token ID in metadata)

4. **Mint with reserved ID**
   ```javascript
   await blockchainService.mint(
     reservation.tokenId,  // First parameter is now the reserved ID
     wallet,
     metadataUri,
     ...
   );
   ```

## Reservation Expiry

Reservations expire after 1 hour. This prevents:
- Abandoned reservations blocking token IDs forever
- Griefing attacks where someone reserves IDs without minting

If a reservation expires:
- The token ID is "burned" (will never be minted)
- Gaps in token IDs are normal and expected for NFTs
- The reserver must call `reserveTokenId()` again to get a new ID

## Error Handling

The contract reverts with custom errors:

| Error | Cause |
|-------|-------|
| `NoValidReservation` | Token ID was never reserved or reservation was cleared |
| `ReservationNotYours` | Caller didn't make this reservation |
| `ReservationExpired` | Reservation exceeded 1 hour |

## Gas Costs

The reservation system adds one transaction:

| Operation | Approximate Gas |
|-----------|-----------------|
| `reserveTokenId()` | ~50,000 gas |
| `mint()` | ~150,000 gas (unchanged) |

Total cost increase is minimal compared to the security guarantee.

## Migration Notes

The `mint()` function signature changed:

```solidity
// Old (DO NOT USE)
function mint(address to, string uri, bytes32 imageHash, ...)

// New
function mint(uint256 reservedTokenId, address to, string uri, bytes32 imageHash, ...)
```

All callers must update to:
1. Call `reserveTokenId()` first
2. Pass the reserved ID as the first parameter to `mint()`
