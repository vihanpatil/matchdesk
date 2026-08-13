# MatchDesk — Project Status

**Snapshot taken:** 2026-08-13 · **HEAD:** `870ae6f` · **Branch:** `main`,
**20 commits ahead of `origin/main`, nothing pushed.**

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
| `DECISIONS.md`              | 24 ADRs — architecture and policy decisions              |
| `HONESTY_LOG.md`            | 58 entries — every known weakness, measured not asserted |

---

## 2. Where we actually stand

### Working, measured, gate-clean

```
$ pnpm verify        exit 0
Test Files  42 passed       Tests  729 passed
Statements  98.77%   Branches 93.22%   Functions 100%
Mutation    80.42%   (ratchet 79)   survivors 378
```

| Area                     | State                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `packages/core`          | Taxonomy, extraction, cascade steps 1–3, eligibility, explain |
| `apps/server`            | SQLite + migrations, repositories, file store, PDF/DOCX       |
| Pipeline (core ↔ server) | **Connected** — document → score, 15 end-to-end tests         |
| Metamorphic relations    | 26 total: 22 generated, 4 still example loops (see §3)        |
| Mutation testing         | 80.42%, every module ≥ 68.5% (ADR-020)                        |
| CI                       | `.github/workflows/ci.yml` exists; a GitHub remote now exists |

### Does NOT exist yet — be clear about this

- **`apps/web` does not exist.** No UI of any kind.
- **No HTTP server, no entry point, no launcher, no `start` script.** The
  pipeline is a callable module plus a measurement script, nothing a recruiter
  can run.
- **No fixture corpus** (ADR-018 Section 9.2).
- **Embeddings (cascade step 4) and OCR are deferred**, with typed seams only.

**The tool has never been used by the recruiter it is for.** That is the single
biggest untested assumption in the project.

---

## 3. The gate that governs everything: ADR-023 E1–E5

No UI work begins until extraction is "hardened", and ADR-023 defines that in
five measurable criteria. **Current status:**

| ID  | Criterion                                                             | Status                           |
| --- | --------------------------------------------------------------------- | -------------------------------- |
| E1  | **Two consecutive** adversarial rounds find no new wrong-score defect | **NOT MET** — counter at 0       |
| E2  | Every wrong-score defect pinned by a property/metamorphic test        | **MET** (H-055)                  |
| E3  | Section 9.2 fixture corpus exists and passes                          | **NOT MET** — does not exist     |
| E4  | Mutation ≥ 75 overall, no extraction/scoring module below 60          | **MET** — 80.42%, weakest 68.50% |
| E5  | Zero open wrong-score HONESTY_LOG entries                             | **MET** — H-052 closed (ADR-024) |

**Two criteria remain: E3 and E1, in that order.** E1 cannot be satisfied
before E3 exists, because the fixture corpus is part of what a verifier round
should be run against.

ADR-023 also defines the three-way severity split that lets this gate
terminate. Use it when triaging any new finding:

**E2 caveat, so nobody over-reads it.** E2 is met because every wrong-score
_defect_ now has at least one generated property. It does **not** mean every
test in the metamorphic file is a relation: `R6c`, `R7`, `R8` and `R9` are
still `for` loops over hard-coded lists (H-051). Their defect classes are
covered by the generated `R10`, `R17`, `R17b` and `R18` alongside them.
Converting the remaining four is worthwhile cleanup, not a gate blocker.

- **wrong-score** — a wrong number, or fabricated evidence for one. **Blocks.**
- **false-refusal** — declines something readable. Does not block; the
  recruiter sees the refusal and the document.
- **coverage-gap** — an input not yet understood. Does not block; product scope.

Without that split every gap blocks forever and E1 never fires.

---

## 4. Next moves, in order

1. **Build the Section 9.2 fixture corpus (E3).** ~12 focused synthetic
   fixtures: one per known defect class (H-028 D1–D8, H-033, H-034, H-042,
   H-043) plus clean baselines. ADR-014 is absolute — **synthetic only, no real
   CV or job description, ever.** This is the last concrete blocker.
2. **Run an ADR-015 adversarial round against the hardened slice + corpus.**
   Judge findings against E1–E5 using the severity split. If it finds no
   wrong-score defect, that is round 1 of 2.
3. **Run a second clean round to satisfy E1.** The counter genuinely restarts
   on any wrong-score finding — the 2026-08-13 round found five.
4. **Then, and only then, `apps/web`**: Jobs, Candidates, Shortlist.
   React 19 + Vite + Tailwind 4 + Radix, TanStack Query/Table.
5. **Fastify API over the existing pipeline**, then the launcher script
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

- **Scope is well understood and the foundation is unusually solid** — 729
  tests, 80.42% mutation score, an end-to-end pipeline, and a governance
  record that has repeatedly caught real defects.
- **The visible product is at zero.** Everything built so far is engine and
  infrastructure. A recruiter cannot open anything.
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

- **H-036** — 378 mutation survivors remain; `explain.ts` is the largest block
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
