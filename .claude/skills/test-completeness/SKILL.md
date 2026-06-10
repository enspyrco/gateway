---
name: test-completeness
description: Audit and fix the test suite so that every test can actually fail and every critical path is actually exercised. Inspired by the UNEMPLOYED.md Section 3 findings (stub-widget tests, permanently skipped tests, mock-only auth coverage, CI skip-gate). Use when test theater needs converting into test evidence.
---

# Test Completeness — "Tests That Cannot Fail Are Not Tests"

The doctrine: a test suite's value is measured by what it can CATCH, not by
what it counts. A green run must mean something. This skill converts test
theater into test evidence.

## Phase 0 — Read the indictment

Read `UNEMPLOYED.md` Section 3 in the repo root. Verify each finding still
exists before acting on it (the file may be stale; line numbers drift). The
known charges:

1. Widget tests assert against hand-rolled stub widgets, never the real pages
   (`flutter/test/widget/marketplace_page_test.dart`,
   `flutter/test/integration/app_test.dart`)
2. 6/7 wallet provider tests permanently skipped
   (`flutter/test/unit/wallet_provider_test.dart`)
3. Backend Jest suites run only against mocks; the real `SIWEVerifier` path is
   never tested; no failure-path coverage (RPC timeout, partial mint,
   concurrent idempotency)
4. `mint-flow.integration.test.js:234` tolerates the mint failing
5. CI `ci-status` treats a skipped Flutter job as success; `flutter analyze`
   runs with `--no-fatal-infos --no-fatal-warnings`

## Phase 1 — Audit (before writing anything)

Build a table of every test file: suite, count, what it ACTUALLY instantiates,
skip markers, and a one-word verdict: `real | stub | skipped | tolerant`.
Also measure:
- Which exported backend functions/routes have zero test references (grep
  route paths and service function names against test/).
- Which Flutter pages/providers are never constructed in any test.
- What CI actually gates (read `.github/workflows/ci.yml` end to end).

## Phase 2 — Fix the charges

Work in this order (each fix is an independent commit):

1. **Make stub tests real.** Widget tests must pump the actual widget
   (`MarketplacePage()`, etc.). The HTTP-blocking problem that motivated the
   stubs is solved by injection, not by faking the subject: introduce a
   minimal injectable API client (or use `http.Client` injection /
   `mocktail`) so the real widget renders against a fake *transport*, not a
   fake *widget*. Loading, success, empty, and error states each get a test.
2. **Un-skip the skippable.** For each skipped wallet test, either (a) extract
   the logic under test so it no longer needs a live wallet service (address
   formatting, account switching, and disconnect logic are pure or mockable),
   or (b) convert it into a real integration test that runs when the service
   is up and is EXCLUDED from the unit suite — not silently skipped inside it.
   Zero `skip:` markers may remain without a comment justifying them AND a CI
   job that runs them somewhere.
3. **Test the real verifier.** Add unit tests for `SIWEVerifier` itself using
   ethers to generate genuine SIWE signatures with a throwaway key — valid
   signature accepted, wrong address rejected, expired rejected, malformed
   rejected. The MockVerifier must no longer be the only verifier with
   coverage.
4. **Remove tolerance.** The integration mint test must assert success when
   `RUN_INTEGRATION_TESTS=true`. A test that passes when the feature fails is
   deleted or fixed — never kept.
5. **Close the CI gate.** `ci-status` must fail when a needed job is skipped
   due to path filtering while Dart/JS files changed; remove
   `--no-fatal-warnings` (fix the warnings it surfaces, or explicitly inline-
   ignore each with a reason).

## Phase 3 — Go beyond the indictment

The criticism is a floor, not a ceiling. Add, where the code makes it
feasible (each its own commit):

- **Failure-path tests for the mint pipeline**: IPFS succeeds → Arweave
  fails; RPC timeout mid-reserve; duplicate `mintId` issued concurrently
  (Promise.all two requests; assert exactly one reservation).
- **Boundary tests** for marketplace reads: zero tokens, a reserved-but-
  unminted token ID in range, a delisted token.
- **Contract test parity**: every `revert` reason string in the Solidity
  contracts should appear in at least one test expectation (grep and diff the
  two sets; add tests for the uncovered reverts).
- **A coverage floor**: wire `jest --coverage` and `flutter test --coverage`
  into CI with a modest, honest threshold (measure first, set the bar at
  current-level-plus-nothing, so it only prevents regression — no vanity
  targets).

## Phase 4 — Prove it

- Run the full backend suite and the full Flutter suite. Both green.
- **Mutation spot-check**: deliberately break one assertion target (e.g.,
  flip the verifier's address comparison) and confirm the new tests FAIL.
  Revert the breakage. A new test that survives its mutation is rewritten.
- Summarize: tests before/after, skips before/after, what can now fail that
  couldn't before.

## Rules

- NEVER weaken a production behavior to make it testable in a way that
  changes its contract. Injection points are additive.
- NEVER delete a failing test to get green — fix the code or the test, and
  say which and why.
- Commit per logical fix with messages explaining WHY (cite the UNEMPLOYED.md
  charge it answers). Do not push. Do not touch UNEMPLOYED.md.
- If a fix requires a design decision with real trade-offs, choose the
  simplest option and record the alternative in the commit message.
