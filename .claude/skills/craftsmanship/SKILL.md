---
name: craftsmanship
description: Audit and fix code craftsmanship — god-files, copy-paste divergence, inconsistent error handling, unsafe defaults, stale docs, repo hygiene, accessibility. Inspired by the UNEMPLOYED.md Section 4 findings but generalized. Use after the test suite is trustworthy, so refactors run under a safety net.
---

# Craftsmanship — "The Code You Leave Is the Colleague You Were"

The doctrine: craftsmanship is empathy with the next reader, made concrete.
Every fix here must leave behavior identical (except where the behavior itself
was the defect — e.g., silent localhost fallbacks) and leave the reader's life
easier. Refactor only under passing tests; run the relevant suite after every
step.

## Phase 0 — Read the indictment

Read `UNEMPLOYED.md` Section 4 in the repo root. Verify each finding still
exists (the file may be stale). The known charges:

1. `flutter/lib/pages/token_detail_page.dart` — 1,226-line god-file holding
   the UI tree plus `_list`/`_delist`/`_buy` transaction flows
2. `_getLicenseColor()` copy-pasted across three files with divergent
   signatures (`marketplace_page.dart`, `gallery_page.dart`,
   `token_detail_page.dart`)
3. `_buy()` discards the stack trace that `_list()` keeps
4. `api_service.dart` / `wallet_service.dart` silently default to
   `http://localhost:*` in release builds
5. Zero `Semantics`/`semanticLabel`/`Tooltip` anywhere in `flutter/lib/`
6. Stale Mumbai testnet references (`contracts/.env.example`,
   `hardhat.config.js`, `README.md`, `CLAUDE.md`) — Mumbai is dead; Amoy is
   the successor
7. Repo hygiene: `NFT-presentation.pdf` at root; loose `detect-all.js` /
   `populate.js` with hardcoded URLs and keys; ~10 ad-hoc scripts in
   `wallet-service/`; `debugPrint()` confetti in page code

## Phase 1 — Audit (before changing anything)

- Rank `flutter/lib/` and `backend/src/` files by line count; anything > 500
  lines gets a responsibility list (what distinct jobs live in it).
- Duplication sweep: search for near-identical function bodies across files
  (license colors are the known case; look for siblings — formatting helpers,
  address truncation, snackbar patterns).
- Consistency sweep: catalogue every `catch` clause in `flutter/lib/` (with vs
  without stackTrace, logged vs swallowed); every `String.fromEnvironment` /
  `Platform.environment` default; every magic number with a comment doing a
  constant's job (e.g., `31337 // Hardhat`).
- Hygiene sweep: binaries tracked by git, scripts at the wrong level, TODO/
  FIXME/HACK census, dead files nothing references.

## Phase 2 — Fix the charges (each its own commit, tests after each)

1. **Split the god-file.** Extract from `token_detail_page.dart`: the three
   transaction flows into a controller/service (`token_actions.dart` or
   similar — pure logic, returns results, no BuildContext), and the large
   widget subtrees into focused widget files. Target: no file > ~400 lines,
   no behavior change, existing tests still pass.
2. **One `licenseColor`.** Single function in a shared module, one parameter
   type (the enum, with a parsing helper for strings at the boundary). Delete
   all three copies. Compile-time proof of convergence.
3. **Uniform error handling.** Every transaction-flow catch captures
   `(e, stackTrace)` and reports through one logging helper. While there:
   replace raw `debugPrint` in lib/ pages with that helper (it can wrap
   debugPrint in debug mode and be silent/structured in release).
4. **No silent localhost in release.** Defaults stay for debug builds;
   release builds without an injected URL must fail fast at startup with an
   explicit error (assert + clear message), not quietly point at localhost.
5. **Accessibility floor.** `Tooltip` + `semanticLabel` on every icon-only
   button; `Semantics` on the gallery grid items and the primary
   buy/list/delist actions. Not full WCAG — a floor, honestly described.
6. **Kill Mumbai.** Replace with Amoy (or plain `polygon` + localhost) across
   env examples, hardhat config, README, CLAUDE.md. Verify the RPC URLs you
   introduce actually resolve before writing them.
7. **Hygiene.** Move loose root scripts into `scripts/` with a README line
   each; move `wallet-service/` ad-hoc test scripts into
   `wallet-service/scripts/` (or delete the obviously dead ones — check git
   log before deciding dead); `git rm --cached` the presentation PDF only if
   it is reproducible elsewhere — otherwise leave it and note why.

## Phase 3 — Go beyond the indictment

Improvements along the same dimension the criticism didn't reach:

- **Named constants module** for chain IDs, license levels, API paths shared
  between Flutter pages.
- **Tighten the linter honestly.** Enable `avoid_print`,
  `prefer_const_constructors`, `directives_ordering`,
  `always_declare_return_types` in `analysis_options.yaml`; fix what they
  flag. Add at most what the codebase can satisfy TODAY — a suppressed lint
  rule is worse than an absent one.
- **Doc truth pass.** Every command in README/CLAUDE.md quickstarts gets
  executed (or dry-run where destructive); stale ones fixed or deleted.
  Docs that describe aspirations (Cloud KMS, live Polygon) get reworded to
  describe reality with a roadmap note.
- **Dead code burial.** Anything the audit found unreferenced: delete
  completely (no `_unused` renames, no commented-out corpses — git remembers).

## Phase 4 — Prove it

- Full Flutter + backend suites green; `flutter analyze` clean under the
  TIGHTENED rules.
- Before/after table: file line counts, duplicate count, catch-clause
  consistency, lint rule count, files moved/deleted.

## Rules

- Refactors NEVER bundle behavior changes in the same commit; the localhost
  fail-fast and accessibility additions are behavior changes — separate
  commits, called out as such.
- NEVER refactor a file with no test coverage without first adding at least a
  characterization test (render it, exercise the happy path) — the
  test-completeness pass should have provided this; if it didn't, add it.
- Commit per logical fix, message explains WHY (cite the UNEMPLOYED.md charge
  or the dimension extended). Do not push. Do not touch UNEMPLOYED.md.
- Preserve public API of anything `backend/src` exports unless nothing
  imports it (then delete it fully).
