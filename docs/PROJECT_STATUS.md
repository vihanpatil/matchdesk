# MatchDesk — Project Status

**Snapshot taken:** 2026-08-13 (revised end of day) · **HEAD:** `1d63547` ·
**Branch:** `main`, **25 commits ahead of `origin/main`, nothing pushed.**

> **This file is a point-in-time briefing and will go stale.**
> `docs/SESSION_STATE.md` is the live operational document — read that first
> when resuming work, and treat it as authoritative if the two disagree.
> Every number below was measured on the date above, not carried forward.

---

## 1. What this is

A local-first tool a single recruiter runs on their own machine. They upload
job descriptions and CVs (PDF/DOCX); both persist locally; they see
explainable, evidence-backed match scores. **No candidate data leaves the
machine.**

The binding constraint is **C7: never score a document you could not fully
read.** A wrong score is a real harm to a real person, so the project's whole
method is built to catch confident-but-wrong output rather than to ship fast.

Three documents govern it, all append-only:

| File                        | Role                                                     |
| --------------------------- | -------------------------------------------------------- |
| `docs/PRODUCT_DECISIONS.md` | Product source of truth for v1 (ADR-021)                 |
| `DECISIONS.md`              | 27 ADRs — architecture and policy decisions              |
| `HONESTY_LOG.md`            | 73 entries — every known weakness, measured not asserted |

---

## 2. Where we actually stand

### Working, measured, gate-clean

```
$ pnpm verify        exit 0
Test Files  45 passed       Tests  794 passed
Statements  98.90%   Branches 643/690   Functions 100%
Mutation    80.89%   (ratchet 79)   survivors 369
```

| Area                     | State                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `packages/core`          | Taxonomy, extraction, cascade steps 1–3, eligibility, explain |
| `apps/server`            | SQLite + migrations, repositories, file store, PDF/DOCX       |
| Pipeline (core ↔ server) | **Connected** — document → score, 15 end-to-end tests         |
| Metamorphic relations    | 26 total: 22 generated, 4 still example loops (see §3)        |
| Mutation testing         | 80.89%, every module ≥ 70.3% (ADR-020)                        |
| CI                       | `.github/workflows/ci.yml` exists; a GitHub remote now exists |

### Does NOT exist yet — be clear about this

- **`apps/web` does not exist.** No UI of any kind.
- **No HTTP server, no entry point, no launcher, no `start` script.** The
  pipeline is a callable module plus a measurement script, nothing a recruiter
  can run.
- **Embeddings (cascade step 4) and OCR are deferred**, with typed seams only.

(The fixture corpus **does** now exist — both tiers, E3 MET. An earlier revision
of this list still said it did not.)

**The tool has never been used by the recruiter it is for.** That is the single
biggest untested assumption in the project.

**And one known defect currently produces wrong numbers** — H-041/ADR-027, a
CV part-written in another language scored on its English part. Open, blocking,
and the reason E5 fails.

---

## 3. The gate that governs everything: ADR-023 E1–E5

No UI work begins until extraction is "hardened", and ADR-023 defines that in
five measurable criteria. **Current status:**

| ID  | Criterion                                                             | Status                                      |
| --- | --------------------------------------------------------------------- | ------------------------------------------- |
| E1  | **Two consecutive** adversarial rounds find no new wrong-score defect | **NOT MET** — counter at 0                  |
| E2  | Every wrong-score defect pinned by a property/metamorphic test        | **NOT MET** — H-041 unpinned (H-070)        |
| E3  | Section 9.2 fixture corpus exists and passes                          | **MET** — Phase 4, both tiers               |
| E4  | Mutation ≥ 75 overall, no extraction/scoring module below 60          | **MET** — 80.89%, weakest 70.33%            |
| E5  | Zero open wrong-score HONESTY_LOG entries                             | **NOT MET** — H-041 is wrong-score, ADR-027 |

**Three criteria remain: E5, then E2, then E1, in that order.** E5 needs the
H-041 remediation; E2 needs a relation that can generate sub-floor foreign
passages, which is separate work; E1 cannot start until both are done, because
two clean rounds cannot certify an engine with a known open wrong-score defect.

**This table was wrong in three of five rows until 2026-08-13** — it claimed E2
and E5 MET and E3 nonexistent, all three false. See H-071. **Do not read a gate
status from this file alone**; `docs/SESSION_STATE.md` and ADR-027 are the
sources, and if they disagree with this table the table is the bug.

ADR-023 also defines the three-way severity split that lets this gate
terminate. Use it when triaging any new finding:

**E2 was claimed met on the same over-reading it warns about.** The old caveat
here said E2 was met because every wrong-score _defect_ has a generated
property, while noting `R6c`/`R7`/`R8`/`R9` are still `for` loops (H-051).
**The real failure was subtler:** R-L1 _is_ a generated property, and it still
cannot construct the input that breaks the thing it pins — it generates the CV,
the language and the insertion position, and holds the foreign passage's
**length** constant, which is the defect axis (H-070). Having a property is not
the same as having a property that can reach the defect.

- **wrong-score** — a wrong number, or fabricated evidence for one. **Blocks.**
- **false-refusal** — declines something readable. Does not block; the
  recruiter sees the refusal and the document.
- **coverage-gap** — an input not yet understood. Does not block; product scope.

**ADR-027 corrects this split** and is binding: ADR-023 listed the mixed-language
blind spot under false-refusal, which was wrong, because the tool does not
refuse there — it scores. **Abstention is not refusal.** When a guard stays
silent, classify by what the SYSTEM then does, not by what the guard did.

Without that split every gap blocks forever and E1 never fires.

---

## 4. Next moves, in order

1. ~~Build the Section 9.2 fixture corpus (E3).~~ **Done** — both tiers, 794
   tests, **E3 MET.**
2. **Remediate H-041 (E5).** The mixed-language veto only judges 15+-word
   passages and CV lines run 8-13, so it is silent on most real CVs and a
   partly-non-English CV is scored on its English part — **56 and ineligible
   versus 100 and eligible for the same person** (ADR-027). Three candidate
   fixes are listed in `SESSION_STATE.md`'s START HERE block; **measure the
   false-refusal cost before choosing one.**
3. **Give E2 a relation that can reach the defect.** R-L1 must generate foreign
   passages BELOW the word floor, not only above it (H-070). Separate work from
   step 2 — fixing the veto does not fix the relation that failed to pin it.
4. **Run an ADR-015 adversarial round against the hardened slice + corpus.**
   Judge findings against E1–E5 using the severity split **as corrected by
   ADR-027**. If it finds no wrong-score defect, that is round 1 of 2.
5. **Run a second clean round to satisfy E1.** The counter genuinely restarts
   on any wrong-score finding — the 2026-08-13 round found five.
6. **Then, and only then, `apps/web`**: Jobs, Candidates, Shortlist.
   React 19 + Vite + Tailwind 4 + Radix, TanStack Query/Table.
7. **Fastify API over the existing pipeline**, then the launcher script
   (ADR-013), then the remaining directive phases: matrix, PDF report, optional
   LLM narrative, hardening.

**Cheap parallel work that does not touch the gate:** kill the remaining 55
`explain.ts` mutation survivors; add the `explain.ts` caveat that H-040 needs;
convert `R6c`/`R7`/`R8`/`R9` from loops into generated properties.

---

## 5. Timeline — read this honestly

**There is no dated timeline in this repo, and there never has been.** Progress
is tracked by phase gates, not calendar. Phase 0 is complete and independently
verified; the thin slice (ADR-011) is built, failed adversarial verification
(H-028), and has been hardened since.

So "are we on schedule" cannot be answered against a plan. What can be said:

- **Scope is well understood and the foundation is unusually solid** — 794
  tests, a two-tier fixture corpus, an end-to-end pipeline, and a governance
  record that has repeatedly caught real defects. See §3 for the current
  mutation figure; do not quote one from memory.
- **The visible product is at zero.** Everything built so far is engine and
  infrastructure. A recruiter cannot open anything.
- **One known defect currently produces wrong numbers for real people**
  (H-041/ADR-027): a CV part-written in another language is scored on its
  English part. This is the gate's whole purpose working as intended — it was
  caught before any recruiter saw it — but it is open, and it blocks.
- **The main schedule risk is E1's shape:** each adversarial round has found
  defects, and each finding resets the two-round counter. If rounds keep
  finding wrong-score defects, the UI stays blocked indefinitely. Watch for
  this. If two more rounds each find defects, that is a signal to re-examine
  whether the gate's bar is right — not to quietly lower it.
- **Unmeasured performance risk remains for the deferred features.** The
  200×200 matrix first fill is measured at **0.34 s**, but that is the
  rule-based path only. Embeddings and OCR are unmeasured (H-008).

---

## 6. Mid-project decisions that changed direction

These are the reversals a newcomer would otherwise re-litigate:

| Decision | What changed                                                                           |
| -------- | -------------------------------------------------------------------------------------- |
| ADR-021  | `docs/PRODUCT_DECISIONS.md` supersedes the original build directive for v1             |
| ADR-021  | **"Free forever" and "offline after first run" are NOT v1 commitments** any more       |
| ADR-022  | Partly-English documents are refused, not scored on the readable part                  |
| ADR-023  | "Hardened" got measurable exit criteria; the slice was connected before more hardening |
| ADR-024  | **Derived attributes are never persisted** — they drift from the score otherwise       |

**ADR-024 is the one most likely to be violated by accident.** Anything the
engine can recompute from `rawText` must not be stored. Recruiter _decisions_
(suppressions) are still stored — the distinction is authorship, not
convenience. ADR-024 also fixes, in advance, how suppression must work: it
references the content key `(candidateId, attributeKind, normalizedValue)` and
**deliberately excludes the evidence span**, because spans move when extraction
improves and a span-keyed suppression would silently stop applying.

---

## 7. Things that will bite you

**Environment.** Every command needs the pinned Node, or `pnpm` will not
resolve:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
```

**After adding tests** you must run `pnpm test:manifest` and raise `minTests`
in `scripts/test-floor.json`, or CI fails. The manifest regenerates from _the
last run_ — regenerating after a filtered run silently shrinks the identity
gate. A floor guard now blocks that accident (H-044), but a hand-edited
manifest still passes.

**Commit with `git commit -F <file>`, never `-m`** — backticks in a `-m` string
get shell-interpreted and the commit silently fails.

**`pnpm mutate` leaves `.stryker-tmp/`** on disk. It is ignored by lint,
format and git (H-039), but it is ~15 minutes per run — do not run it casually.

**Lint bans `!` non-null assertions and `as` narrowing.** Narrow by throwing.

**Never lower the mutation ratchet or `minTests`** without a HONESTY_LOG entry
saying why.

---

## 8. The failure pattern — the most important section

**Nine times, a passing metric has concealed a real defect.** This is the
project's defining characteristic and the reason for its unusual process:

| Entry | Green signal               | What it concealed                                         |
| ----- | -------------------------- | --------------------------------------------------------- |
| H-004 | 100% coverage              | Measured file set quietly too small                       |
| H-013 | 100% branch coverage       | Four untested behaviours                                  |
| H-022 | 93% branch coverage        | Every test used American degree forms                     |
| H-025 | All tests + CI green       | A commit claiming work never done                         |
| H-028 | 369 tests, 94% branches    | Seven defect classes producing wrong scores               |
| H-036 | 95.22% branch coverage     | 65.03% mutation score — 607 survivors                     |
| H-045 | An ADR and a verified gate | `apps/server` had **never imported** `@matchdesk/core`    |
| H-051 | Tests named `R7`–`R10`     | They were `for` loops, not relations                      |
| H-054 | 729 passing tests          | The explanation claimed a requirement was MET _and_ a gap |

**Practical rules that follow:**

- Coverage counts lines executed. Mutation counts behaviour pinned. They are
  different numbers.
- A test living in a metamorphic file and named `R<n>` is not a relation unless
  it uses `fc.property`. Check.
- **Verify agent reports rather than relaying them.** Every engineer report has
  been broadly accurate, and spot-checking has still found real defects they
  missed.
- **Never narrow a property to make it pass without writing down why.** Two
  were legitimately narrowed on 2026-08-13; both reasons are in the test files.
- A negative result from a probe that cannot fire is not evidence. One was
  nearly filed as such (H-052).

---

## 9. Open items worth knowing

Full list in `docs/SESSION_STATE.md` §5. The ones that shape decisions:

- **H-036** — 369 mutation survivors remain; `explain.ts` is the largest block
  at 55.
- **H-040** — tenure is understated when date ranges fail to parse: one parsed
  3-year role beats an unparsed 20-year claim. Needs a recruiter-visible caveat
  in `explain.ts`, not a formula change.
- **H-041** — the mixed-language veto abstains on terse CVs; a terse _bilingual_
  CV is still scored. C7 gap narrowed, not closed.
- **H-008** — OCR and embedding budgets unmeasured.
- **H-002** — cross-machine determinism not guaranteed (limits C4).
- **H-028 D7** — `audit_log` `INSERT OR REPLACE` bypasses the append-only
  trigger. An **integrity** defect, not a wrong-score one, so E2 does not apply
  — it stays open on its own merits.
- **H-053 / H-056** — two documented ambiguities that are _not_ being fixed:
  `<degree word> of <field>` is genuinely indistinguishable from a real degree
  name, and `roundHalfUp` breaks its error bound above ~1e9 (outside the
  scoring domain — do not reuse that function elsewhere assuming the bound).

---

## 10. Fastest path to being useful in a new session

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
cd /Users/vihanpatil/personal/projects/Resume-Match/matchdesk
git status && git log --oneline -10
pnpm verify                      # ~1 min, must exit 0
```

Then read, in this order: `docs/SESSION_STATE.md` §2 and §8 →
`docs/PRODUCT_DECISIONS.md` → `DECISIONS.md` ADR-021 through ADR-024 →
`HONESTY_LOG.md` from H-045 onward.

**Do not trust any number in a document without re-running it.** That rule
exists because this file's predecessor claimed the tree did not compile when it
did (H-037).
