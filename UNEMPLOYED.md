# UNEMPLOYED.md

**RE: Application for Senior Software Engineer**
**Candidate:** Robin Langer
**Portfolio piece reviewed:** `gateway` — NFT art marketplace (Flutter + Node.js + Solidity)
**Reviewer:** Employment Manager, Human Resources
**Recommendation:** DO NOT HIRE (at senior level) — see findings below

Dear candidate,

Thank you for your interest in the senior engineering position. We reviewed your
portfolio with the diligence it deserves, which is to say: we went looking for
reasons to say no. We found them. They are itemized below with file references,
because unlike your smoke check (until recently), we do not report green on a
broken deploy.

---

## Section 1 — Security: "senior" engineers don't ship these

**1.1 Your replay protection is decorative.**
`backend/src/middleware/strategies/siwe-verifier.js` accepts a `nonceStore`
constructor parameter, stores it, and never reads it again. The auth factory
(`backend/src/middleware/auth.js:20`) never even passes one. A stolen SIWE
bearer token can be replayed for up to 24 hours. You wrote the parameter, you
documented the parameter, you did not use the parameter. This is installing a
smoke detector without the battery — while writing a comment praising the
battery.

**1.2 You trust the client to tell you what a file is.**
`backend/src/index.js:47` validates uploads via `file.mimetype` — the
client-supplied `Content-Type` header. No magic-byte check. Anyone can label
arbitrary bytes `image/png` and have them piped into your Rust watermark binary
and onward to IPFS. A senior engineer validates at trust boundaries; you
validated at the honor system.

**1.3 Unauthenticated unbounded proxy.**
`backend/src/index.js:129` — the `/ipfs/:hash` route buffers arbitrary IPFS
content fully into Node heap. No `Content-Length` cap, no streaming, no auth.
This is a denial-of-service endpoint you wrote yourself, for free.

**1.4 Rate limiting protects the cheap routes and not the expensive one.**
The image-generate route gets its own 10/15min limiter; `/api/mint` — the route
that spends gas, uploads to Pinata, and writes to Arweave — shares only the
global 100/15min limit (`backend/src/index.js:63`). An attacker can drain your
minter wallet at a leisurely 100 attempts per 15 minutes, well within policy.

**1.5 Production fallback to a Hardhat toy address.**
`contracts/deployment.json` is committed, pointing at the famous
`0x5FbDB...80aa3` on chainId 31337, and `real-service.js:loadContractAddress()`
silently falls back to it when `NFTMARKET_CONTRACT_ADDRESS` is unset. A
misconfigured production deploy connects to a contract that does not exist and
tells no one until a transaction fails.

---

## Section 2 — Correctness: the bugs you shipped to your own "production"

**2.1 Your idempotency store evaporates at scale.**
`backend/src/commands/mint-command.js` deduplicates concurrent mints with an
in-process JS `Map`. You are literally on a branch named `feat/oci-deploy` —
container deployment — where two replicas with the same `mintId` will both call
`reserveTokenId()` on-chain. The concurrency protection works only as long as
you never scale, which is a curious property to engineer on purpose.

**2.2 `totalSupply()` lies, and you patched it with silence.**
`NFTmarketNFT.totalSupply()` returns `_nextTokenId`, which is incremented at
*reservation*, not mint. Your backend scan loops then call `ownerOf()` on
unminted IDs and swallow the reverts with `.catch(() => null)`
(`real-service.js:494-679`). Systematic errors, systematically hidden.

**2.3 The marketplace read path is O(N) over the entire chain.**
`getActiveListings()` makes ~3 RPC calls per token, for every token ever
minted, on every `GET /api/marketplace`, with no pagination, no indexer, no
cache. Your own comment at `real-service.js:495` admits it. At 1,000 tokens
that is ~3,000 RPC calls per page load. The senior-engineer move is building
the indexer; the candidate's move was writing a comment apologizing for its
absence.

**2.4 Two contracts walk into a repo; nobody knows which one is real.**
`contracts/contracts/NFTmarketNFT.sol` (1,133 lines, UUPS, Hardhat tests) and
`contracts/src/NFTLicensingSystem.sol` (different architecture, Foundry tests
referencing functions the other contract doesn't have). The README describes
one contract. Which is deployed? The panel asked. The repo shrugged.

---

## Section 3 — Testing: the appearance of rigor

**3.1 Your widget tests test widgets you made up for the test.**
`flutter/test/widget/marketplace_page_test.dart` and
`flutter/test/integration/app_test.dart` never instantiate `MarketplacePage()`.
They build hand-rolled stub widgets — a literal `CircularProgressIndicator` —
and assert against those. The comment at `marketplace_test.dart:10` explains
why real widgets were too inconvenient to test. These tests cannot fail. That
is not the same as the code being correct.

**3.2 Six of seven wallet tests are permanently skipped.**
`flutter/test/unit/wallet_provider_test.dart:47,59,72,90,107,129` — connect,
auth, address formatting, account switching, disconnect, signing — all marked
`skip: 'Requires wallet service running'`. CI counts them as zero failures.
Zero failures, zero verification, zero difference.

**3.3 The backend tests never meet the real auth code.**
All Jest suites run with mocks enabled; `MockVerifier`
(`mock-verifier.js:17`) accepts any 66-character string as a "signature" and
takes the wallet address from the client at face value. No test covers RPC
timeout mid-mint, partial failure (IPFS succeeds, Arweave fails), or concurrent
idempotency. The integration test at `mint-flow.integration.test.js:234`
explicitly tolerates the mint *failing*, as long as it fails politely.

**3.4 CI is structured to let broken Flutter code merge.**
`.github/workflows/ci.yml`: the `ci-status` job treats a *skipped* Flutter job
as success. A PR touching only docs skips Flutter analysis entirely — pair a
README change with a Dart compile error and CI waves it through. Meanwhile
`flutter analyze --no-fatal-infos --no-fatal-warnings` mutes what little signal
remains, `avoid_print` is commented out in `analysis_options.yaml:24`, and 14+
`debugPrint()` calls decorate `token_detail_page.dart` like fairy lights.

---

## Section 4 — Craftsmanship

**4.1 The 1,226-line god-file.**
`flutter/lib/pages/token_detail_page.dart` contains the full UI tree plus three
distinct money-moving transaction flows (`_list`, `_delist`, `_buy`). Your own
`ARCHITECTURE.md` lists it as "Remaining" work. Self-awareness noted; refactor
not.

**4.2 Copy-paste with divergent signatures.**
`_getLicenseColor()` exists in three files (`marketplace_page.dart:223`,
`gallery_page.dart:637`, `token_detail_page.dart:875`) — with *different
parameter types*, so the duplicates can silently disagree about what color a
license is. Money disagreeing about color is how lawsuits start.

**4.3 Error handling by mood.**
`_list()` catches `(e, stackTrace)` and logs both; `_buy()` at
`token_detail_page.dart:1083` catches `(e)` and discards the trace. The flow
that moves the most money keeps the least evidence.

**4.4 Production builds default to localhost.**
`api_service.dart:21` and `wallet_service.dart:64` fall back to
`http://localhost:3000/3001` when `--dart-define` is omitted. No startup
assertion. Per the commit history (`fix(flutter): parameterize wallet-service
URL`), this already broke production once. The lesson was patched; the pattern
remains.

**4.5 Zero accessibility.**
Not one `Semantics`, `semanticLabel`, or `Tooltip` across all 19 lib files.
Icon-only buttons with no labels. Screen-reader users cannot buy your NFTs,
which is admittedly one way to protect them.

**4.6 The quickstart points at a testnet that no longer exists.**
Mumbai was deprecated in 2024. `contracts/.env.example:5`,
`hardhat.config.js:21-35`, `README.md:126`, and `CLAUDE.md:110` still send new
contributors to `rpc-mumbai.maticvigil.com` to enjoy a connection error.

**4.7 Repo hygiene, miscellaneous.**
A 336 KB pitch deck (`NFT-presentation.pdf`) committed to root under MIT;
operational scripts (`detect-all.js`, `populate.js`) loose at root with
hardcoded localhost URLs and Hardhat keys; ~10 ad-hoc debug scripts in
`wallet-service/` wired into no CI; and `main` sitting 18 commits behind the
branch where the actual working software lives, so anyone evaluating this
portfolio from the default branch is reviewing the broken version.

**4.8 `CATEGORY_THEORY.md`.**
Fifty-five law tests proving your backend event sinks form a comonoid. The
document is correct, rigorous, and answers a question no stakeholder asked,
while questions 1.1 through 3.4 above sat unanswered. We note the candidate can
prove the naturality square commutes but not that an upload is a PNG.

---

## Section 5 — In fairness (HR requires we include this)

The panel concedes, reluctantly:

- The bilateral EIP-712 signature design with on-chain nonces is sound.
- The token-ID reservation pattern genuinely eliminates the mint race.
- `_distributePayment()` is textbook checks-effects-interactions pull-payment.
- Fail-fast config that refuses `ALLOW_MOCK_SIGNATURES` in production shows
  production awareness.
- `ARCHITECTURE.md` honestly lists its own weaknesses — rare, and noted.
- The CD workflow's volume-safety documentation and manual-only reset job is
  better operational thinking than most actual seniors produce.
- There is a real E2E test against a real chain (`integration_test/e2e_test.dart`).

These are senior-level instincts. They make the gaps above more damning, not
less: the candidate clearly knows better.

---

## Final Determination

The candidate demonstrates strong architectural instincts, unusual theoretical
depth, and documentation honesty — wrapped around dead-code auth protections,
honor-system upload validation, tests engineered to be unfailable, and a CI
gate that lets unanalyzed code merge. This is the profile of a brilliant
engineer who has never had a colleague.

**Status: UNEMPLOYED.**

We will keep your résumé on file, which is HR for "the comonoid document
frightened us."

*This review was generated by an adversarial audit and is itself a portfolio
piece. The irony is not lost on HR.*
