# Session State — read this first

**Purpose:** let any new session resume without re-deriving context. Updated at
the end of every working session. If this file disagrees with the code, **the
code is right and this file is a bug** — fix it.

**Last updated:** 2026-08-12 · **HEAD at last update:** `ab7e4d5` (the commit
recording this file follows it). Working tree clean, `pnpm verify` exit 0.

---

## 1. What this project is

**MatchDesk** — a loopback-only local browser app an individual recruiter runs
on their own machine. They upload English text-based job descriptions and CVs
(PDF/DOCX), both persist locally, and they inspect explainable,
evidence-backed match scores. CV and job-document content never leave the
machine.

`docs/PRODUCT_DECISIONS.md` is the current v1 product source of truth. It
supersedes any unconfirmed product assumption in the originating build
directive. The root-level `resume-checker*.html` files are historical API/LLM
prototypes, not MatchDesk requirements.

Historical directive constraints still visible in the codebase are:

| ID  | Constraint                                                                 |
| --- | -------------------------------------------------------------------------- |
| C1  | Free forever — **not a current v1 release commitment**                     |
| C2  | Offline after first run — **not a current v1 release commitment**          |
| C3  | Local data sovereignty — candidate PII never leaves the machine            |
| C4  | Deterministic scoring                                                      |
| C5  | Hallucination-impossible scoring — no generative model in the scoring path |
| C6  | Durable persistence                                                        |
| C7  | No silent failure — never score a document you could not fully read        |

**The guiding principle:** every number the recruiter sees must be traceable to
highlighted source evidence.

---

## 2. Status

**Phase 0: COMPLETE**, gate evidence pasted, independently verified, CI green.

**Thin slice (ADR-011): built, then FAILED adversarial verification (H-028).**
Six of seven defect classes now fixed. Extraction hardening continues; **no UI
work until it is done** (ADR-018).

| Area                        | State                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `packages/core`             | Taxonomy, extraction, cascade 1-3, eligibility, explanation    |
| `apps/server`               | SQLite, migrations, repositories, dedup, file store, PDF/DOCX  |
| Metamorphic relations       | 18 in core + 2 language relations, all green (ADR-019)         |
| Mutation testing            | Configured, baseline measured, ratchet at 64 (ADR-020)         |
| Pipeline (core ↔ server)    | **Connected (ADR-023)** — document → score, 9 end-to-end tests |
| `apps/web`                  | **NOT STARTED** — blocked behind extraction hardening          |
| Embeddings (cascade step 4) | Deferred; typed seam exists                                    |
| OCR                         | Deferred                                                       |

**Measured baseline — `pnpm verify` run 2026-08-12, exit 0, tree gate-clean:**

| Gate                 | Result                                                     |
| -------------------- | ---------------------------------------------------------- |
| `pnpm typecheck`     | pass                                                       |
| `pnpm lint`          | pass                                                       |
| `pnpm format:check`  | pass                                                       |
| `pnpm license:audit` | pass (1 waiver: `duck@0.1.12`, ADR-016)                    |
| `pnpm test:cov`      | **528 passed / 41 files**, none skipped, manifest complete |

Coverage: **98.41% statements, 92.57% branches, 100% functions** repo-wide.
Mutation score **65.03%** is from the last `pnpm mutate` at `e778837` and has
**not** been re-run since the D5/D6 work landed — treat it as stale, not as
evidence. That gap is still the most important number in this document (§6).

**An earlier revision of this section claimed the tree did not typecheck and
that D6's refusal gate was unimplemented. Both were false — see H-037.** Never
copy a gate result forward; run it.

### Landed since `e778837` — verified against live behaviour, not reports

1. **Platform (`apps/server`)** — D6 language detector **replaced**: the
   stopword-ratio heuristic is gone, superseded by Cavnar & Trenkle character
   n-gram profiling against nine hand-authored reference corpora, plus a
   held-out eval corpus asserting a confusion matrix with **zero false
   positives** (no non-English document classified English — the C7-critical
   direction). The refusal gate was **already implemented** at `e778837` in
   `extractText.ts` `judgeLanguage()`, refusing on both `isEnglish === null`
   and `isEnglish === false`.
2. **Core (`packages/core`)** — D5b/D5c experience de-duplication landed:
   overlapping roles merged by interval union, bare `YYYY - YYYY` ranges near
   quantity words rejected, future-dated ranges rejected, and explicit
   "N years" claims no longer summed with the ranges that describe them
   (**H-040** records what that rule costs).

3. **Mixed-language refusal (ADR-022)** — a code-switched CV was being scored
   on its English part; measured, a 50%-French document still classified
   English. `findNonEnglishSegments` now vetoes it and `extractText` refuses
   with `mixed_language_content`. Veto-only, so it cannot manufacture an
   English verdict. Floor validated against a held-out ten-CV corpus outside
   the software domain (**H-041**, which also records what it still misses).

**Still absent:** D7 `PRAGMA recursive_triggers` and audit-log mutation
coverage; the `explain.ts` mutation-survivor backlog; a _consumer_ of the
language verdict (no scoring pipeline or API exists yet to act on it).

**If resuming cold: run `git status` and `git log` first, then `pnpm verify`.**
Re-verify any claim in this file against live behaviour rather than trusting it.

## 3. How to run anything

Every command needs the pinned Node. The machine default is older and `pnpm`
will not resolve without this:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
cd /Users/vihanpatil/personal/projects/Resume-Match/matchdesk
```

| Command              | Does                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `pnpm verify`        | Everything CI runs: typecheck, lint, format, license, tests, coverage   |
| `pnpm test`          | Tests + skip guard + manifest identity check                            |
| `pnpm test:manifest` | Regenerate the test identity manifest — **required after adding tests** |
| `pnpm license:audit` | Two-tier license gate                                                   |

| `pnpm mutate` | Stryker, ~8.5 min, scoped to `packages/core` |

**After adding tests you MUST** run `pnpm test:manifest` and bump `minTests` in
`scripts/test-floor.json`, or CI fails.

**Commit with `git commit -F <file>`, never `-m`.** Backticks inside a `-m`
string get shell-interpreted and the commit silently fails.

**Never commit while an agent is mid-edit.** The pre-commit hook runs the full
suite and will correctly block on a transiently red tree.

---

## 4. Decisions that constrain all future work

Full reasoning in `DECISIONS.md`. The ones most likely to be violated by
accident:

- **ADR-005** — a scoring dimension is N/A **only when the job states no
  requirement for it**, never based on candidate attributes. This is what makes
  monotonicity provable. Getting it wrong makes the tool punish candidates for
  having more credentials.
- **ADR-007 (partially superseded by ADR-017)** — work authorization
  contributes **zero** to any score; institution is never scored; graduation
  year is **never extracted**. These remain fully binding. The clause about
  must-haves not scoring is dead — see ADR-017.
- **ADR-011** — thin slice first, then rigour. The fixture corpus, OCR and full
  Section 9 coverage are deferred, not cancelled.
- **ADR-012** — recruiter data lives in `~/.matchdesk/`, never in the repo.
- **ADR-014** — the repo is **public**. No real CV, no real job description, no
  recruiter-identifying content may ever be committed. Ever.
- **ADR-015** — an Opus adversarial verifier runs at every phase gate. The user
  is on Claude Pro (5-hour and weekly rate limits, not per-token billing) and
  has explicitly chosen to keep Opus for this role.
- **ADR-016** — license waivers are pinned to exact versions and require reading
  the actual LICENSE file. "Probably fine" is not evidence.
- **ADR-024** — derived attributes are **never persisted**. Anything the
  engine can recompute from `rawText` must not be stored, or it drifts from the
  number it justifies. Recruiter DECISIONS (suppressions) are still stored —
  the distinction is authorship, not convenience.
- **ADR-023** — "extraction hardened" now has **measurable exit criteria
  (E1-E5)** and a three-way severity split: only **wrong-score** findings block
  the UI. **false-refusal** and **coverage-gap** findings do not. Without that
  split every gap blocks forever and the gate never opens.

---

## 5. Open items — nothing here is signed off

| ID    | Item                                          | Why it matters                                                           |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------ |
| H-002 | Cross-machine determinism not guaranteed      | Limits C4; mitigated by 6dp quantization, not solved                     |
| H-007 | Section 7 LLM validator can't do what's asked | Catches fabricated entities, not fabricated relations                    |
| H-008 | OCR budget unmeasured (matrix half CLOSED)    | Matrix first fill measured at 0.34 s (H-046). OCR + embeddings untouched |
| H-015 | `--no-verify` bypasses hooks                  | Unfixable client-side; CI is the backstop                                |
| H-020 | ~~Stale `dist/` survives a failing compile~~  | **CLOSED** — went live on the first import, mitigated + verified (H-047) |
| H-033 | ~~Degree guard context-window dependent~~     | **CLOSED** — lower-case "as" rejected; pinned by R10 (H-042)             |
| H-034 | ~~Invisible characters~~                      | **CLOSED** — they FABRICATED skills, not just broke extraction (H-042)   |
| H-036 | **607 mutation survivors**                    | `explain.ts` 28.93% — the recruiter-facing reasoning is unverified       |
| H-040 | Tenure understated when ranges don't parse    | A 3-year parsed role beats a 20-year claim. Needs an `explain.ts` caveat |
| H-041 | Mixed-language veto abstains on terse CVs     | A terse BILINGUAL CV is still scored. 4 of 10 held-out CVs are silent    |
| H-051 | **E2 FAILS — 9 of 12 defects unpinned**       | R6c/R7/R8/R9 and R-L1/R-L2 are LOOPS, not relations, despite the names   |
| H-052 | **Stored evidence drifts from the score**     | Ingest-time attributes vs re-derived scoring: 7 years shown, 21 scored   |
| H-044 | Manifest completeness is unverifiable         | Floor guard blocks the accident; a hand-edited manifest still passes     |

**From H-028, still open:** D7 audit-log `REPLACE` bypass; D8 (negative weights
unvalidated, `confidence` computed but never read, evidence spans
order-dependent, empty-requirement job marks everyone eligible, cert
level-variant identity, `migrate.ts` `localeCompare`). **D5b/D5c and D6 are
landed and verified** — but neither has been through the ADR-015 adversarial
verifier, which has falsified three gate claims so far.

**Also unverified by anything automated:** `experience.ts` branch coverage is
**84%** and `invisible.ts` is **70%**, both below the 90% bar their package is
held to — absorbed by the `packages/core/src/**` aggregate at 92.53%, so no
gate fired (H-040). An aggregate hiding a per-file regression is H-004's
pattern; these two are named so they are known numbers, not discoveries.

**Known extraction gaps, reported not fixed:** UK vocational (A-Level, GCSE,
HND, BTEC, NVQ); PGDip/PGCE; non-English degree names; `FIELD_VOCAB` is 14
US-skewed entries; date-format locale assumptions in `experience.ts`.

---

## 6. The failure pattern — read before trusting any green number

Six times a passing metric has concealed a real defect:

| Entry | Green signal               | What it concealed                                           |
| ----- | -------------------------- | ----------------------------------------------------------- |
| H-004 | 100% coverage              | Measured file set quietly too small                         |
| H-013 | 100% branch coverage       | Four untested behaviours (v8 ignores `\|\|` operands)       |
| H-022 | 93% branch coverage        | Every test used American degree forms                       |
| H-025 | All tests + CI green       | A commit claiming work never done                           |
| H-028 | 369 tests, 94% branches    | Seven defect classes producing wrong scores for real people |
| H-036 | **95.22% branch coverage** | **65.03% mutation score — 607 survivors**                   |

**Coverage counts lines executed. Mutation counts behaviour pinned. They are not
the same number, and the gap is 30 points on this codebase.**

The two best-scoring files under mutation — `span.ts` (100%) and `round.ts`
(96.88%) — are the two written under adversarial pressure. Tests written against
an adversary beat tests written against the author's own expectations.

---

## 7. Working agreements

- **Test-first** in `packages/core`: write the test, run it, observe the real
  failure, paste it, then implement.
- **An ADR is a decision, never evidence of implementation** (H-025). No commit
  message may reference an ADR as done without pasted output from the running
  system.
- **Never edit a golden file or a property test to match new behaviour** without
  stating explicitly why the new expectation is correct.
- **Verify agent reports rather than relaying them.** Every engineer report this
  session has been broadly accurate, and spot-checking still found a real bug
  both engineers missed (H-022) and one stale claim.
- **Lead with failures.** First sentence, not buried after what worked.

---

## 8. Next steps, in order

**No UI work until extraction is hardened** (ADR-018). A clickable demo over
wrong numbers invites trust the tool has not earned.

1. ~~Land the two in-flight agents.~~ **Done** — verified against live
   behaviour, manifest reconciled, floor 428 → 454, `pnpm verify` exit 0
   (H-037, H-038).
2. ~~Add metamorphic relations for the gaps that have none.~~ **Done** —
   R10 (bare-fragment degree guard, H-033), R11/R12 (invisible characters,
   H-034), R13-R16 (experience de-duplication), and R-L1/R-L2 (mixed
   language). **They found three live defects on the first run**: invisible
   characters FABRICATE skills rather than merely breaking extraction, the
   lower-case word "as" yields an associate degree, and the ADR-022 veto
   missed Danish/Norwegian/Swedish. All three fixed (H-042, H-043).
3. ~~Wire `core` ↔ `apps/server`.~~ **Done (ADR-023)** — there had never been a
   path from a document to a score (H-045). Also closed H-020 (H-047) and the
   matrix half of H-008 (H-046).
4. ~~Run the adversarial verifier round.~~ **Done, and it failed the gate.**
   Five defects (H-048..H-052); four fixed, **H-052 open and blocking**.
   E1-E5 verdict: E1 NOT MET, E2 NOT MET (9 of 12), E3 NOT MET, E4 CANNOT
   ASSESS, E5 NOT MET. **No UI work.**
5. ~~Decide H-052.~~ **Done — derived attributes are never persisted
   (ADR-024).** `candidate_attributes` dropped; `matches.reference_date` added
   so every score names all three of its inputs and is reproducible from
   stored state. **E5 is unblocked.**
6. **Convert the fake relations into real ones (E2).** R6c/R7/R8/R9 in core and
   R-L1/R-L2 in the language eval are `for` loops named like relations. R10 has
   been converted as the worked example.
7. **Re-run `pnpm mutate`** — the 65.03% baseline predates D5/D6 and is stale (E4).
   Then **kill survivors, ratcheting the threshold up as they fall.** Order by
   human impact: `explain.ts` (28.93%) → `certifications.ts` (49.66%) →
   `skills.ts` (55.60%) → `education.ts` (65.47%). Note `experience.ts` also
   regressed to 84% branch coverage when D5 landed (H-040).
8. **Section 9.2 fixture corpus**, ~12 focused fixtures (ADR-018/E3): one per
   known defect class plus clean baselines.
9. **Then** `apps/web`: Jobs, Candidates, Shortlist. React 19 + Vite +
   Tailwind 4 + Radix, TanStack Query/Table.
10. Fastify API over the pipeline; launcher script (ADR-013); then the
    remaining directive phases (matrix, PDF report, LLM narrative, hardening).

---

## 9. Team

Per ADR-004: Opus tech lead (owns architecture, gates, both logs, all user
communication) + Sonnet engineers scoped to one package each + **an Opus
adversarial verifier whose job is to falsify gate claims, not confirm them.**

The verifier has falsified a gate claim **three times**, including two
regressions the lead introduced — one repeating a trap the lead had already
written down — and it produced H-028, which stopped a demonstrably broken slice
from reaching a recruiter. **It is the highest-value role on the team. Do not
skip it.**

The user is on Claude Pro (5-hour and weekly rate limits, not per-token
billing) and has explicitly chosen to keep this role at Opus for quality.
