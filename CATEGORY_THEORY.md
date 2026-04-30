# Categorical Structure: NFTmarket

This document catalogues the genuine categorical structures in the NFTmarket codebase, where they live, which laws are tested, and how they connect. It was generated after a categorical sweep that fixed law violations and introduced law tests.

## Categorical Inventory

| Structure | Category/Object | Location | Laws Tested |
|-----------|----------------|----------|-------------|
| Writer monad `[A, Event[]]` | Kleisli category over `(A, Event[])` | `src/utils/writer.js`, all backend services | Left unit, Right unit, Associativity |
| Kleisli composition | `composeK(f, g)(a) = f(a) >>= g` | `src/utils/writer.js` | Left identity, Right identity, Associativity |
| License semilattice | `{Display < Commercial < Transfer}` as bounded lattice | `src/utils/license-utils.js`, `NFTmarketNFT.sol` | Reflexivity, Antisymmetry, Transitivity, Totality, Join/Meet idempotence, commutativity, associativity, Absorption |
| Event-sink comonoid | Comultiplication fans events to sinks | `src/events/dispatch.js`, `src/events/sinks/` | Diagonal delivery, Failure isolation, Order preservation, Counit extraction |
| Natural transformation `Mock -> Real` | Components at each service type | `src/services/blockchain.js`, `ipfs.js`, `arweave.js`, `watermark.js` | Signature alignment, Result shape, Event structure, Transfer rights invariant |
| Functor `LicenseType -> Rights` | Maps license levels to permission sets | `canSell`, `canUpgrade` in `license-utils.js` | Order preservation, Strict order |

## Structure Details

### Writer Monad `[A, Event[]]`

**What**: Every write-path service function returns `[result, events]` where `events` is an array of `AppEvent` objects. The monoid is `(AppEvent[], concat, [])`.

**Where**: `src/utils/writer.js` provides `unit`, `bind`, `composeK`, and `tell`. Used by `src/routes/mint.js` for the mint pipeline. Service functions in `blockchain.js`, `watermark.js`, `ipfs.js`, `arweave.js` all return Writer values.

**Laws**: Left unit, right unit, and associativity are tested with stub Kleisli arrows in `test/categorical/writer-monad.test.js`.

**Design note**: Read-only operations (e.g., `getTokenData`, `getListing`) return plain values, not Writer values. This is correct: reads are morphisms in the base category, not the Kleisli category. Only write operations that produce loggable side effects live in the Kleisli category.

### License Semilattice

**What**: License types `{Display: 0, Commercial: 1, Transfer: 2}` form a bounded total order, hence a bounded lattice. The order relation governs rights escalation: you cannot sell more rights than you have (`requestedLevel <= ownerLevel`).

**Where**: `src/utils/license-utils.js` exports `canSell`, `canUpgrade`, `licenseJoin`, `licenseMeet`. The same order is enforced in `NFTmarketNFT.sol` and replicated in Dart.

**Laws**: All lattice laws (reflexivity, antisymmetry, transitivity, totality, join/meet idempotence, commutativity, associativity, absorption) are exhaustively tested over the finite set in `test/categorical/license-semilattice.test.js`.

### Event-Sink Comonoid

**What**: The dispatch system fans each event to N registered sinks. This is comultiplication in `(Set, x)`: one event object is delivered (by reference) to every sink. Each sink extracts what it needs (counit).

**Where**: `src/events/dispatch.js` implements `dispatch`, `registerSink`, `removeSink`, `clearSinks`.

**Laws**: Diagonal delivery (same object to all sinks), failure isolation (one sink's exception doesn't prevent others), order preservation (events arrive in dispatch order), and counit extraction (different sinks extract different projections) are tested in `test/categorical/event-sink-comonoid.test.js`.

### Natural Transformation: Mock -> Real

**What**: Each service has a mock mode (controlled by `USE_MOCK_*` env vars) and a real mode. For the transformation to be natural, mock and real must accept the same parameters and produce structurally equivalent results.

**Where**: `src/services/blockchain.js` (fixed), `ipfs.js`, `arweave.js`, `watermark.js`.

**Fix applied**: The mock `mint()` previously accepted `licenseType` and `licenseHash` parameters that the real contract does not. This broke naturality: `real . transform != transform . mock` for those fields. Fixed by aligning the mock signature to match the contract: `mint(reservedTokenId, to, uri, imageHash, ipfsUri)`. Creator always receives Transfer rights in both paths.

**Laws**: Signature alignment, result shape equivalence, event structure equivalence, and the Transfer-rights invariant are tested in `test/categorical/naturality.test.js`.

## Connections Between Structures

**Writer-Comonoid adjunction**: The Writer monad *produces* events (accumulates them via bind), and the comonoid *consumes* them (fans them to sinks via dispatch). The call `dispatch(w[1])` at the end of each route handler is the counit of this adjunction.

**License lattice and token state**: A token's listability depends on its position in the license lattice. The constraint `!token.isOriginal && licenseType !== Transfer` in `listToken` restricts license tokens to a sub-poset where only Transfer is available.

**Mock/Real and Writer**: Both mock and real implementations return `[result, events]`, so the natural transformation maps between functors that land in the same Writer category. The naturality fix ensures the transformation commutes with bind.

## Law Test Coverage

| File | Structure | Laws Tested | Count |
|------|-----------|-------------|-------|
| `test/categorical/writer-monad.test.js` | Writer monad, Kleisli composition, tell | Left unit (3), Right unit (3), Associativity (3), Kleisli identity (2), Kleisli associativity (1), tell (3) | 15 |
| `test/categorical/license-semilattice.test.js` | License lattice, canSell, canUpgrade | Order laws (4), Join laws (4), Meet laws (3), Absorption (2), canSell (4), canUpgrade (5) | 22 |
| `test/categorical/event-sink-comonoid.test.js` | Event dispatch comonoid | Comultiplication (2), Failure isolation (2), Order (1), Counit (1), Management (3) | 9 |
| `test/categorical/naturality.test.js` | Mock/Real natural transformation | Signature (2), Result shape (2), Event structure (2), Transfer invariant (3) | 9 |
| **Total** | | | **55** |

## Law Verification Summary

| Structure | Identity | Composition | Left Unit | Right Unit | Associativity | Round-Trip | Kleisli |
|-----------|----------|-------------|-----------|------------|---------------|------------|---------|
| Writer monad | n/a | n/a | PASS | PASS | PASS | n/a | PASS |
| Kleisli composition | PASS | PASS | n/a | n/a | PASS | n/a | n/a |
| License semilattice | PASS (reflexivity) | n/a | n/a | n/a | PASS (join/meet) | n/a | n/a |
| Event-sink comonoid | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Mock/Real naturality | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## What Category Theory Cannot Tell You Here

- **Express route ordering**: The requirement that `/eip712/domain` precedes `/:tokenId` is URL pattern matching, not categorical structure.
- **Mock parameter backward compatibility**: The `buyToken` parameter-shifting logic is legacy API debt.
- **Fee simulation**: Flutter's `payFee` methods are ordinary code duplication, not a categorical pattern.
- **SIWE authentication**: Decoding a token, verifying a signature, and attaching a wallet address is a pipeline, not usefully described as a Kleisli arrow.
- **Flutter state management**: The `MintProvider` state enum is a finite state machine. Calling it a free category adds no insight given Dart's type system.
