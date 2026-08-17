# Session State — read this first

**Purpose:** let any session — human or agent — resume without re-deriving
context. If this file disagrees with the code, **the code is right and this
file is a bug**: fix it. Updated at the end of every working session; HEAD is
the commit that last touched it (`git log -1 -- docs/SESSION_STATE.md`).

## Start here

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
pnpm gate      # prints the release gate — do NOT read one from any document
pnpm verify    # must exit 0
```

**Gate at last update (2026-08-17): all five criteria MET.** E1 — every
`ATTACK_CHECKLIST` row Covered. E2 — every wrong-score finding pinned by a
test that fails without its fix. E3 — the fixture corpus runs in the suite.
E4 — mutation score above the ratchet (see §Watch items). E5 — zero open
wrong-score findings. Re-run the commands rather than trusting this sentence.

**Commits are unpushed and the user has HELD the push** — run
`git log --oneline @{u}..HEAD | wc -l` for the count. An ADR-014 content scan
is clean and on file. **Do not push without asking.**

## What this is

A loopback-only local app for one recruiter: upload English job descriptions
and CVs (PDF/DOCX), get explainable, evidence-backed match scores. Content
never leaves the machine. `docs/PRODUCT_DECISIONS.md` is the product source of
truth; `README.md` is the entry point and carries the doc map.

## What exists / what does not

**Exists, gate-clean:** extraction and deterministic scoring
(`packages/core`), ingestion + language detection + SQLite + the
document→score pipeline (`apps/server`), a two-tier golden fixture corpus, the
full verification machinery (gate registry, mutation ratchet, manifest
integrity, licence-text audit), and — since ADR-035 — the **HTTP API the UI
will talk to**: `pnpm serve` binds `127.0.0.1` only, uploads are raw bytes,
requirement proposal is the extractor itself, and an unconfirmed job cannot be
scored. Tested end-to-end over a real socket.

**Exists since ADR-036:** `apps/web` — the UI. Vanilla ES modules, zero
dependencies, served by `pnpm serve` at the same origin as the API. Ranked
results, requirement confirmation, needs-attention tray with reasons, evidence
highlighting, light/dark, ambient motion. Verified end-to-end in a real
browser.

**Does not exist:** the match matrix (secondary view, PRODUCT_DECISIONS), a
packaged launcher beyond `pnpm serve`, embeddings (cascade step 4), OCR.

## Next phase

**➡ READ `docs/NEXT_PHASE.md` FIRST.** The product met its first real CV on
2026-08-17 and failed twice: the contact line refused the whole document
(H-116, false-refusal — the sixth instance of trap 1), and jobs cannot be
deleted from the UI (H-117). Both are diagnosed from measurement with a fix
plan and pass criteria. Fix those before anything below.

After that, in rough order of value:

- **Use it against a real pool** — the fastest way to find what the corpus
  cannot: real CVs, at volume, on the recruiter's own machine.
- **The match matrix** — the agreed secondary view. 200×200 stays a capacity
  ceiling, never a rendered layout.
- **Recruiter conveniences** PRODUCT_DECISIONS names: attribute suppression
  with rescore, job-local custom skills, background recompute with visible
  stale states.
- **Packaging** — a launcher that opens the browser, per PRODUCT_DECISIONS.
- **UI rows for `ATTACK_CHECKLIST`** — the UI exists now, so attack it.

## Watch items — open, none blocking

- **H-110 · mutation-score trend.** Four consecutive measurements declined
  (80.42 → 79.85) with the ratchet at 79; headroom ~0.85. `experience.ts` is
  the weakest module (69.36%) and it computes tenure. If a core change breaks
  the build, **raise the score, never lower the ratchet** — the instruction
  is in `stryker.config.json` where you'll read it when tempted.
- **ADR-033 · two live licence risk acceptances.** `dingbat-to-unicode@1.0.1`
  ships to the recruiter with no licence text anywhere (via `mammoth`);
  `stackback@0.0.2` is dev-only. Replacing `mammoth`'s dependency is a
  decision nobody has taken. They print loudly on every audit run.
- **H-108 · sections.** A _dateless_ `Experience   Team Lead, Acme Corp` line
  is still taken for a header (a job-title pair and a location are the same
  shape without digits). No tenure impact — dated forms are rejected.
- **H-113 · transliteration.** A foreign line stripped to bare ASCII is not
  recognised as unreadable. Native orthography is caught in nine languages;
  bare-ASCII transliteration is not a CV format.
- **H-107 residual.** The concurrent-ambiguous-date bound assumes one locale
  per document; disclosed in `dimensions.ts`.

## How to work on this codebase

Earned across five sessions — each rule has a finding behind it:

- **Run `pnpm gate` and `pnpm verify` yourself.** Never accept a subagent's
  or a document's word for a gate result.
- **A finding is not closed until a test fails without the fix** (ADR-028;
  H-090 is what happens otherwise).
- **An engineer's passing tests are not the acceptance criterion** (H-109).
  Trace every fix to the number a recruiter actually sees.
- **Parallel work:** partition by directory, bar every worker from
  `pnpm verify`/`pnpm typecheck`/`pnpm install` (shared build state), keep
  derived state (snapshots) with the lead, run the full verify once,
  serialized. H-098 is the seam defect that motivates this.
- **The ADR-015 verifier did not author the work and is not told the lead's
  view** (H-069; H-094 — a verifier once confirmed the label while falsifying
  the description on four counts).
- **Never rewrite a failing golden fixture to match new behaviour** without
  stating why the new value is correct — a fixture whose purpose is forgotten
  gets "fixed" into asserting the bug (the H-037 shape). Snapshot diffs are
  reviewed line by line by the lead.

## Traps this project keeps falling into

1. **A corpus lacking the population it fails on** — H-022, H-079, H-086,
   H-088, H-106, H-111 (twice inside one fix). Hand-built English corpora
   under-sample proper nouns and technology lists.
2. **A guard that cannot fire** — write the failing test first (H-060, H-070,
   H-090).
3. **A figure carried across a change** — quote `n/total`, re-run, never copy
   forward (H-074, H-058, H-096).
4. **A narrowing reported as a closure** — H-078, H-085.
5. **Abstention read as refusal** — classify by what the _system_ does
   (ADR-027).
6. **Agreement on a label mistaken for agreement on the facts** — H-094.
7. **A measurement at the wrong granularity** — H-091.
8. **A fix that relocates the wrong number instead of removing it** — H-109.
9. **A defect's name encoding a wrong hypothesis about its cause** — H-115.
   H-041 cost five sessions chasing "language detection"; the defect was
   asserting a negative from silence. See README's "If you read one thing".
