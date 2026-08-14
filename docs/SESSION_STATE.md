# Session State — read this first

**Purpose:** let any new session resume without re-deriving context. Updated at
the end of every working session. If this file disagrees with the code, **the
code is right and this file is a bug** — fix it.

**Last updated:** 2026-08-13. This file is committed together with the work it
describes, so **HEAD is the commit that last touched it** — `git log -1 --
docs/SESSION_STATE.md`. A hardcoded hash here went stale twice; don't add one
back. Working tree clean, `pnpm verify` exit 0 — see H-058 before quoting any
branch-coverage figure, and H-074 before quoting a coverage total.

**Current work: remediating H-040 + H-041 — one remedy, both defects.**

**START HERE — run `pnpm gate` FIRST. It prints the gate; do not read one.**

**The gate is now computed, not argued (ADR-028, H-075).** Three of the five
criteria used to be opinions and never converged — E5 flipped MET → disputed →
NOT MET and E2 flipped NOT MET → MET → NOT MET without the code changing once,
while E3 and E4, the two you settle by running a command, converged and stayed
converged. `docs/findings.json` now carries a `severity`/`status` per finding
and `pnpm gate` counts them. **Changing a gate result requires editing a
tracked file, which shows up in a diff.** Re-reading prose can no longer move
it. If you find yourself re-deriving whether some entry is wrong-score, stop:
that is the loop this replaced.

**The E5 decision has been TAKEN (ADR-027). Do not re-litigate it.**

**H-041 is classified wrong-score. E5 is NOT MET. E2 is NOT MET.** Decided by
an independent ADR-015 verifier, re-measured a third time by the lead, and
recorded in **ADR-027** — which also corrects a contradiction in ADR-023's
severity split and is binding. Read **ADR-027** first; H-069 and H-070 carry
the measurements behind it.

**Why it blocks:** the same candidate, same facts, scores **56 and ineligible**
when their earlier role and degree are written in Spanish and **100 and
eligible** in English — and the recruiter is told "Requires at least 9 years of
experience; found 4.8" about someone with 9.1 years. `warnings: []`.

**E5 has ONE blocker left: H-041's German residual.** Run `pnpm gate` for the
live count; as of this commit:

- **H-040 — CLOSED (ADR-029, H-081).** When a discarded explicit tenure claim
  would flip the eligibility verdict, `scoreCandidate` raises a blocking
  `Reservation` and `scoreStoredPair` refuses to persist a match. Materiality
  is computed by re-running the experience gate with the discarded claim.
  **Residual, stated:** a non-blocking reservation can still move the score and
  rank order silently.
- **H-041 — NARROWED, still wrong-score.** The prose-gated line window took
  held-out CVs with no judgeable segment from 4/10 to 1/10 at **zero** false
  refusals, and catches bilingual prose in FR and ES, PDF and DOCX, down to
  11.2% foreign content.
- **H-002 — triaged out**, pinned by `scripts/core-determinism.test.mjs`.

**THE REMAINING DEFECT (H-085), after two rounds of narrowing.** ADR-030
replaced the biased prose gate with three measured signals — a **letter-based**
window floor (the old 15-WORD floor was biased against compounding languages,
H-082), a **confidence margin** (H-084), and a **compounding-morphology**
signal for German, where the classifier returns a _wrong_ verdict rather than a
silent one (H-083). Result: 0 false refusals across **both** English corpora,
13/13 non-English refused, every held-out English CV judged, DE/NL/SV/FR
bilingual headers caught, FR/ES prose caught in PDF and DOCX.

**What is still broken:** a foreign insert **below the ~100-letter window
floor** is never isolated — the window grows past it into English and dilutes.

```
ES three lines (145 foreign letters)   refused
DE two compound lines (72 letters)     SCORED
FR one line (35 letters)               SCORED
```

Material, not cosmetic: a one-line foreign degree is ~70 letters, and a degree
is what flipped eligibility in the original reproduction.

**This is H-041's own first sentence, correctly scoped at last:** closing it
needs per-segment identification on ~5-8 word fragments, which
character-statistics cannot do. That is a **different method**, not a tuning
change — and it is the only thing left between here and E5.

**Before choosing one, decide whether it is worth it.** The alternative is the
product decision that keeps being deferred: refuse documents whose language
cannot be verified. That was ruled out at the whole-document level (H-080, it
violates a standing eval requirement), but it has never been evaluated for the
much narrower case that remains.

**The code: choose and measure the remedy.** Deliberately left open (user's
call — "classify now, choose the fix next"). For H-041 the three candidates,
none yet measured, are below. **H-040 needs the same shape of answer** — its
own entry names it: surface the disagreement when an extracted explicit claim
materially exceeds computed tenure, rather than resolving it silently in
arithmetic.

1. **Aggregate consecutive short lines** until they clear the 15-word floor,
   then judge the block with the existing n-gram method. Cheapest; reuses the
   method; the codebase already did this once at sentence granularity (see the
   comment at `languageDetection.ts:300-307`).
2. **Refuse whenever the veto abstained** (`judgedSegmentCount === 0`), perhaps
   gated on a cheap secondary signal. Converts a silent wrong score into a
   visible refusal, which ADR-023 says does not block — but buys it with a
   false-refusal rate that **must be measured**, not assumed.
3. **Per-segment identification for ~8-word fragments.** What H-041 says is
   actually needed; a different method and probably a new dependency under
   ADR-016.

**The floor is not a free parameter.** 12-18 is the measured window, 20 catches
nothing, 10 falsely refuses a real CV. Any change trades a wrong score for
false refusals at a rate nobody has measured on 8-13-word segments.

**E2 must be closed too, and it is not the same work.** R-L1 cannot generate
the failing input (H-070) — it names length as the defect axis and holds length
constant. A fix to the veto does not fix the relation that was supposed to pin
it.

| Phase                                         | State                                       |
| --------------------------------------------- | ------------------------------------------- |
| 1 · ADR-025 (E1 contingency) + ADR-026 (deps) | **Done** — `1e6cd96`                        |
| 2 · Deterministic fixture generator           | **Done** — `24eba4b`                        |
| 3 · Text tier, 13 fixtures                    | **Done** — `075b908`                        |
| 4 · Binary tier + D8 triage → **E3 MET**      | **Done** — `1d63547`                        |
| 5 · **E5 decision (ADR-027)**                 | **Done** — this commit. E5 + E2 NOT MET     |
| 6 · **H-040 + H-041 remediation → E5**        | **NEXT.** Measure, choose, fix, re-classify |
| 7 · **Length-generating relation → E2**       | Blocked on 6 (H-070)                        |
| 8 · Adversarial round 1 (E1)                  | Blocked on 6 and 7                          |
| 9 · Adversarial round 2 (E1)                  | Not started                                 |

**Do not read the gate from here — run `pnpm gate`.** As of the triage
commit: E1 NOT MET (checklist rows A1, A4 open; A5 never run), **E2 NOT MET**
(derived from E5 per ADR-028), E3 MET, E4 see §2, **E5 NOT MET — two
wrong-score blockers, zero unclassified.**

**Agreed working constraints (user):** both fixture tiers; hybrid pass criteria
(targeted assertions **plus** committed snapshots); binaries generated
deterministically, never committed; commit per milestone; full ADR-004 team for
the adversarial rounds, with an independent verifier that did not author the
corpus. **When a judgement call decides a gate, it goes to the independent
verifier — and the verifier is not told the lead's view.**

**Push status: the user explicitly HELD the push on 2026-08-13** (run
`git log --oneline @{u}..HEAD | wc -l` for the current count) until the E2/E5 re-plan is settled. An ADR-014 content scan has
already been run and is **clean**: no real CV or job-description content, all
fixture names synthetic, and the single absolute path in `PROJECT_STATUS.md` is
already public in this file, so it adds no new exposure. **Do not push without
asking again.**

**Where the corpus lives:** `fixtures/corpus/definitions.mjs` (data, shared by
both tiers), `text-tier.test.mjs`, `binary-tier.test.mjs`,
`__snapshots__/`. `pnpm fixtures:build` writes real PDFs/DOCXs to
`fixtures/generated/` (gitignored) if you want to open one.

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

| Area                        | State                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`             | Taxonomy, extraction, cascade 1-3, eligibility, explanation                                                                                                                                   |
| `apps/server`               | SQLite, migrations, repositories, dedup, file store, PDF/DOCX                                                                                                                                 |
| Metamorphic relations       | 22 R-named in core + 3 R-L in the language eval, all green (ADR-019). **4 of the core 22 (`R6c`/`R7`/`R8`/`R9`) are still `for` loops, not generated properties — H-051.** Counted 2026-08-13 |
| Mutation testing            | Ratchet at **79** in `stryker.config.json` (ADR-020), measured **80.89%** (re-run 2026-08-13 after Phase 4)                                                                                   |
| Pipeline (core ↔ server)    | **Connected (ADR-023)** — document → score, **15** end-to-end tests                                                                                                                           |
| `apps/web`                  | **NOT STARTED** — blocked behind extraction hardening                                                                                                                                         |
| Embeddings (cascade step 4) | Deferred; typed seam exists                                                                                                                                                                   |
| OCR                         | Deferred                                                                                                                                                                                      |

**Measured baseline — `pnpm verify` run 2026-08-13, exit 0, tree gate-clean:**

| Gate                 | Result                                                     |
| -------------------- | ---------------------------------------------------------- |
| `pnpm typecheck`     | pass                                                       |
| `pnpm lint`          | pass                                                       |
| `pnpm format:check`  | pass                                                       |
| `pnpm license:audit` | pass (1 waiver: `duck@0.1.12`, ADR-016)                    |
| `pnpm test:cov`      | **794 passed / 45 files**, none skipped, manifest complete |

Coverage, re-measured 2026-08-13 after the E5 decision: **98.9% statements,
~93.0-93.2% branches, 100% functions, 99.22% lines** repo-wide. **The branch
figure is a range on purpose (H-058):** no `fast-check` seed is pinned, so
property tests reach a slightly different branch set each run — **642/690 and
643/690** were both observed from an unchanged tree. Do not quote it as an
exact number.

**The denominator moved, and the old figure was stale, not wrong-at-the-time
(H-074).** This paragraph previously said 638/684 and 639/684. That total was
measured in Phase 1; Phases 2-4 added files inside the coverage scope, so the
measured branch set grew to 690 and nobody re-ran it. **Compare totals, not
just percentages** — a stable-looking percentage over a changed denominator is
a different measurement wearing the same number.

Mutation score **80.89%**, re-run 2026-08-13 after Phase 4 (ratchet 79, break
threshold cleared). Survivors **369** (was 378). Every extraction and scoring
module clears the E4 floor of 60; the weakest is `experience.ts` at **70.33%**,
then `certifications.ts` at 72.97% and `explain.ts` at 74.76%. **E4 MET.**
The run took **14 min 19 s**, not the ~8.5 min recorded earlier — the suite
grew with the corpus. `scripts/lib/fixture-docs.mjs` is still **outside**
Stryker's `packages/core` scope and carries no mutation number at all.

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
   the software domain. **It does not work on ordinary CVs.** The veto only
   judges 15+-word passages and CV lines run 8-13, so it is silent on most
   real documents and a partly-non-English CV is still scored — classified
   **wrong-score** in **ADR-027**, and the reason E5 fails. See H-069.

**Still absent:** D7 `PRAGMA recursive_triggers` and audit-log mutation
coverage; the `explain.ts` mutation-survivor backlog.

**An earlier revision of this section listed "a _consumer_ of the language
verdict" as still absent. That was false** — `pipeline.ts:100` gates
`isScoreable` on `extraction.language === 'en'`, and lines 260 and 326 do the
same. The sentence mattered: it is what made the "nothing acts on it yet"
defence of H-041 look plausible. H-066 had already rejected that defence in
principle; at HEAD it also fails on the facts.

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

| `pnpm mutate` | Stryker, **~14.5 min** (was ~8.5 before the corpus landed), scoped to `packages/core` |

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

| ID    | Item                                                      | Why it matters                                                               |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| H-002 | Cross-machine determinism not guaranteed                  | Limits C4; mitigated by 6dp quantization, not solved                         |
| H-007 | Section 7 LLM validator can't do what's asked             | Catches fabricated entities, not fabricated relations                        |
| H-008 | OCR budget unmeasured (matrix half CLOSED)                | Matrix first fill measured at 0.34 s (H-046). OCR + embeddings untouched     |
| H-015 | `--no-verify` bypasses hooks                              | Unfixable client-side; CI is the backstop                                    |
| H-020 | ~~Stale `dist/` survives a failing compile~~              | **CLOSED** — went live on the first import, mitigated + verified (H-047)     |
| H-033 | ~~Degree guard context-window dependent~~                 | **CLOSED** — lower-case "as" rejected; pinned by R10 (H-042)                 |
| H-034 | ~~Invisible characters~~                                  | **CLOSED** — they FABRICATED skills, not just broke extraction (H-042)       |
| H-036 | 369 mutation survivors (was 607)                          | `explain.ts` 74.76%; 52 survivors left, still the largest single block       |
| H-040 | Tenure understated when ranges don't parse                | A 3-year parsed role beats a 20-year claim. Needs an `explain.ts` caveat     |
| H-041 | **WRONG-SCORE — BLOCKS. Veto silent below 15-word lines** | **Same person = 56/ineligible in Spanish, 100/eligible in English.** ADR-027 |
| H-051 | ~~E2 FAILS — 9 of 12 defects unpinned~~                   | **CLOSED** — R10/R17-R20, R-L1-R-L3 and 9 new properties (H-055)             |
| H-052 | ~~Stored evidence drifts from the score~~                 | **CLOSED** — attributes never persisted; scores reproducible (ADR-024)       |
| H-053 | `<degree> of <field>` is ambiguous                        | "Associate of Engineering" has the same shape as a real degree               |
| H-056 | `roundHalfUp` bound breaks above ~1e9                     | Outside the scoring domain; do NOT reuse this function elsewhere             |
| H-058 | Branch coverage not reproducible run to run               | No `fast-check` seed pinned. Every recorded figure is ±1 branch minimum      |
| H-059 | Fixture determinism needed 3 fixes, not 1                 | `docx` SILENTLY IGNORES `created`/`modified`; only `checkJs` caught it       |
| H-060 | A negative test that could not fire                       | 21-byte buffer never entered the scan it tested. H-052's shape again         |
| H-061 | `PDFDocument.load` restamps dates on read                 | Defaults `updateMetadata: true`. Assert with it OFF, never on raw bytes      |
| H-062 | PDF line model rests entirely on `hasEOL`                 | No vertical-gap fallback. A merged header deletes a section = D1. Unmeasured |
| H-063 | ~~E5's basis was never established~~                      | **CLOSED** — D8 triaged (H-066), H-041 classified (ADR-027). E5 NOT MET      |
| H-064 | Snapshot claimed to include spans, did not                | Only the span TEXT. A span sliding between identical words was invisible     |
| H-067 | PDF generator can't render non-WinAnsi text               | Invisible-character fixtures excluded from the PDF tier. Needs embedded font |
| H-068 | Mixed-language blind spot wider than H-041                | Superseded in part by ADR-027 — "a property of CVs" was an OVERSTATEMENT     |
| H-069 | **H-041 is wrong-score — E5 NOT MET**                     | Independent verifier + third re-measurement. Spanish silent at 53.3%         |
| H-070 | **R-L1 can't generate its own defect — E2 NOT MET**       | Names LENGTH as the axis, then holds it constant. H-004/H-013/H-060 again    |
| H-071 | Two handoff docs disagreed on a gate result               | PROJECT_STATUS said E5 MET, SESSION_STATE said DISPUTED. Corrected           |
| H-072 | "Five of the ten" stale in source + ADR-022               | Eval asserts FOUR. Overstates the blind spot in the comment engineers read   |
| H-074 | Branch total carried forward 3 phases                     | 684 → 690; percentage barely moved. Quote `n/total`, never the % alone       |
| H-073 | Gap fixture doesn't test its own title                    | Says "is SCORED"; never calls `scoreCandidate`. Fix belongs with remediation |
| D7    | audit_log `INSERT OR REPLACE` bypass                      | Integrity defect, not wrong-score — E2 does not apply. Still open            |
| H-044 | Manifest completeness is unverifiable                     | Floor guard blocks the accident; a hand-edited manifest still passes         |

**From H-028, still open:** D7 audit-log `REPLACE` bypass; D8 (negative weights
unvalidated, `confidence` computed but never read, evidence spans
order-dependent, empty-requirement job marks everyone eligible, cert
level-variant identity, `migrate.ts` `localeCompare`). **D5b/D5c and D6 are
landed and verified**, and have now been through an ADR-015 adversarial round
(2026-08-13), which found five further defects — H-048 through H-052.

**Per-file coverage below the package bar** (measured 2026-08-13):
`invisible.ts` 75% branches and `experience.ts` 88% branches, against the 90%
the `packages/core/src/**` glob is held to — absorbed by that glob's 93.98%
aggregate, so no gate fires. An aggregate hiding a per-file number is H-004's
pattern; named here so they stay known rather than discovered.

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
6. ~~Convert the fake relations into real ones (E2).~~ **Done — E2 MET.**
   R10 converted; R17/R17b/R18/R19/R20 added in core; R-L1/R-L2 converted and
   R-L3 added in the language eval; 9 new properties for H-013, H-029, H-036
   and D8. They found two live defects on their first run (H-054, H-056).
7. ~~Re-run `pnpm mutate`.~~ **Done — E4 MET.** 80.42%, ratchet 64 → 79, every
   module above the floor (H-057).
   Then **kill survivors, ratcheting the threshold up as they fall.** Order by
   human impact: `explain.ts` (28.93%) → `certifications.ts` (49.66%) →
   `skills.ts` (55.60%) → `education.ts` (65.47%). Note `experience.ts` also
   regressed to 84% branch coverage when D5 landed (H-040).
8. ~~Decide the E1 contingency and the fixture-generation dependencies.~~
   **Done — Phase 1 of the E3 plan (ADR-025, ADR-026).** ADR-025 makes
   re-examination of the E1 bar mandatory if two further rounds each find a
   wrong-score defect — three permitted outcomes, none of them a silent
   relaxation. ADR-026 approves `pdf-lib@1.17.1` + `docx@9.7.1` as root dev
   dependencies after reading every LICENSE file; **no new metadata waiver is
   required**, the first such addition since ADR-016. Running the gate twice
   also produced **H-058**: branch coverage is not reproducible run to run,
   because no `fast-check` seed is pinned. Not fixed — deliberately, since
   pinning would cost the property that found the `Rémi Dubois` defect.
   **The audit passing with both packages installed is still a PREDICTION**
   until Phase 2 runs it.
9. ~~Build the deterministic fixture generator.~~ **Done — Phase 2.**
   `scripts/lib/fixture-docs.mjs`, 17 tests, **100% statements/branches/
   functions/lines**. Byte-identical output verified across separate
   processes. It took **three** fixes, not one (**H-059**): PDF info dates,
   ZIP per-entry timestamps, and `docProps/core.xml` — where `docx@9.7.1`
   **silently ignores `created`/`modified`**, caught only because
   `tsconfig.scripts.json` sets `checkJs`. Also **H-060** (a negative test
   whose buffer was too short to enter the scan it tested) and **H-061**
   (`PDFDocument.load` defaults to `updateMetadata: true` and restamps dates
   during the read). **ADR-026's audit prediction is discharged:** audit
   passes, production deps still 33, no new waiver. The CLI is deferred to
   Phase 3 — with no definitions it would be dead code.
   **Phase 3 must design around this:** the same definition does NOT yield the
   same text in both formats. Blank lines survive in DOCX and vanish in PDF.
10. ~~Text tier of the corpus.~~ **Done — Phase 3.** `fixtures/corpus/`, 13
    fixtures, 26 tests: 11 wrong-score defect classes, 1 documented gap, 1 clean
    baseline. Each carries targeted claims written from what is CORRECT plus a
    full snapshot with spans. **It failed on its first run** — `d3` expected no
    skills, the engine returned `stakeholder-management`, and the ENGINE was
    right; corrected to an exact expected set, which is stronger than the
    original. Also **H-062** (the PDF line model rests entirely on pdfjs
    `hasEOL`; recorded, deliberately not acted on), **H-063** (**E5's basis was
    never established** — read it before asserting the gate), **H-064** (the
    snapshot claimed to include spans and did not), **H-065** (corrects H-059's
    blank-line reasoning: blank lines are inert, sections skip them).
11. ~~Binary tier + E3.~~ **Done — Phase 4.** `scripts/build-fixtures.mjs`, the
    binary tier, three C7 refusal fixtures, the PDF-vs-DOCX format-parity
    relation, and the D8 triage (H-066). **E3 MET.** Also H-067 and H-068.
12. ~~Decide whether H-041 is wrong-score.~~ **Done — ADR-027. It is, and E5 is
    NOT MET.** Put to an independent ADR-015 verifier rather than decided by
    the lead, then re-measured a third time (H-069). ADR-023's severity split
    is **corrected**: it filed this finding in two classes at once, and its
    false-refusal entry contradicted its own definition and discriminator.
    **Abstention is not refusal** — classify by what the SYSTEM does when a
    guard stays silent, not by what the guard did. The decision also cost
    **E2** (H-070): R-L1 names length as its defect axis and then holds length
    constant, so the class was never pinned. Three of five criteria now fail.
13. **Remediate H-041 → E5.** **NEXT, and it is code.** Three candidate fixes
    are listed in the START HERE block; none is measured yet. Measure the
    false-refusal cost against the held-out ten-CV corpus **before** choosing
    — the 15-word floor has a measured window of 12-18 and nobody has measured
    anything on 8-13-word segments. Then re-classify H-041 and re-assert E5.
14. **A length-generating relation → E2.** Separate work from 13: R-L1 must
    generate foreign passages that fall BELOW the floor, not only above it.
    Fixing the veto does not fix the relation that failed to pin it. Also fix
    H-073's fixture, whose assertion depends on what 13 decides.
15. **Adversarial rounds (E1)** — blocked on 13 and 14. An independent Opus
    verifier that did not author the corpus, attacking the engine plus the
    corpus, triaged by ADR-023's three-way split **as corrected by ADR-027**.
    Two consecutive clean rounds meet E1; any wrong-score finding resets the
    counter to zero. If both find defects, **ADR-025 fires.**
16. **Then** `apps/web`: Jobs, Candidates, Shortlist. React 19 + Vite +
    Tailwind 4 + Radix, TanStack Query/Table.
17. Fastify API over the pipeline; launcher script (ADR-013); then the
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
