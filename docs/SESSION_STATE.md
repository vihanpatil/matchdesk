# Session State — read this first

**Purpose:** let any new session resume without re-deriving context. Updated at
the end of every working session. If this file disagrees with the code, **the
code is right and this file is a bug** — fix it.

**Last updated:** 2026-08-12 · **HEAD at last update:** `e778837`

---

## 1. What this project is

**MatchDesk** — a local-first tool a professional recruiter runs on their own
machine. They upload job descriptions and CVs (PDF/DOCX), both persist locally,
and they see explainable, evidence-backed match scores. Built for one specific
recruiter, but any recruiter should be able to use it. Nothing leaves the
machine.

Governed by a build directive (pasted in the originating session, not in the
repo) whose section numbers are cited throughout the code and both logs. Its
non-negotiables:

| ID  | Constraint                                                                 |
| --- | -------------------------------------------------------------------------- |
| C1  | Free forever — no paid services, no expiring tiers                         |
| C2  | Offline after first run                                                    |
| C3  | Local data sovereignty — candidate PII never leaves the machine            |
| C4  | Deterministic scoring                                                      |
| C5  | Hallucination-impossible scoring — no generative model in the scoring path |
| C6  | Durable persistence                                                        |
| C7  | No silent failure — never score a document you could not fully read        |

**The guiding principle:** every number the recruiter sees must be traceable, in
two clicks, to a highlighted span in the source document.

---

## 2. Status

**Phase 0: COMPLETE**, gate evidence pasted, independently verified, CI green.

**Thin slice (ADR-011): built, then FAILED adversarial verification (H-028).**
Six of seven defect classes now fixed. Extraction hardening continues; **no UI
work until it is done** (ADR-018).

| Area                        | State                                                         |
| --------------------------- | ------------------------------------------------------------- |
| `packages/core`             | Taxonomy, extraction, cascade 1-3, eligibility, explanation   |
| `apps/server`               | SQLite, migrations, repositories, dedup, file store, PDF/DOCX |
| Metamorphic relations       | 11, all green (ADR-019)                                       |
| Mutation testing            | Configured, baseline measured, ratchet at 64 (ADR-020)        |
| `apps/web`                  | **NOT STARTED** — blocked behind extraction hardening         |
| Embeddings (cascade step 4) | Deferred; typed seam exists                                   |
| OCR                         | Deferred                                                      |

**428 tests.** `packages/core` 98.78% statements / 95.22% branches.
**Mutation score 65.03%** — see section 6; that gap is the most important
number in this document.

### IN FLIGHT at last update — VERIFY BEFORE TRUSTING

Two agents were dispatched and had **not** reported:

1. **Platform (`apps/server`)** — D6 language detector rewrite + **the
   enforcement gate** (nothing currently reads the language flag, so ADR-006
   and C7 are unenforced), and D7 `PRAGMA recursive_triggers` + a
   property-based audit-log test across every mutating statement form.
2. **Core (`packages/core`)** — D5b/D5c experience de-duplication, and killing
   `explain.ts` mutation survivors (28.93%, target >75%).

**If resuming cold: run `git status` and `git log` first.** Their work may sit
uncommitted in the working tree. Run `pnpm verify` before trusting anything, and
re-verify their claims against live behaviour rather than reading their reports.

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

---

## 5. Open items — nothing here is signed off

| ID    | Item                                          | Why it matters                                                      |
| ----- | --------------------------------------------- | ------------------------------------------------------------------- |
| H-002 | Cross-machine determinism not guaranteed      | Limits C4; mitigated by 6dp quantization, not solved                |
| H-007 | Section 7 LLM validator can't do what's asked | Catches fabricated entities, not fabricated relations               |
| H-008 | OCR + matrix budgets unmeasured               | Section 11 numbers may be unachievable                              |
| H-015 | `--no-verify` bypasses hooks                  | Unfixable client-side; CI is the backstop                           |
| H-020 | Stale `dist/` survives a failing compile      | **Goes live when `apps/server` imports `@matchdesk/core`**          |
| H-033 | Degree guard is context-window dependent      | Bare fragment "such as Mathematics" still yields a degree           |
| H-034 | Invisible characters                          | ZWSP/soft-hyphen break extraction; routine in PDFs. No relation yet |
| H-036 | **607 mutation survivors**                    | `explain.ts` 28.93% — the recruiter-facing reasoning is unverified  |

**From H-028, open at last update** (dispatched, unconfirmed): D5b/D5c
experience double-counting; D6 language detection + enforcement; D7 audit-log
`REPLACE` bypass; D8 (negative weights unvalidated, `confidence` computed but
never read, evidence spans order-dependent, empty-requirement job marks everyone
eligible, cert level-variant identity, `migrate.ts` `localeCompare`).

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

1. **Land the two in-flight agents** (section 2). Verify against LIVE BEHAVIOUR,
   not their reports. Then `pnpm test:manifest`, bump `minTests`, commit.
2. **Add metamorphic relations for the gaps that have none:** invisible
   characters (H-034), bare-fragment degree guard (H-033), and experience
   de-duplication once D5 lands. Each of these is currently a defect no
   automated check would catch.
3. **Re-run the Opus adversarial verifier** over the hardened slice (ADR-015).
   It falsified the previous two gate claims and produced H-028. Do not skip it.
4. **Kill mutation survivors, ratcheting the threshold up as they fall.** Order
   by human impact: `explain.ts` (28.93%, in flight) → `certifications.ts`
   (49.66%) → `skills.ts` (55.60%) → `education.ts` (65.47%).
5. **Section 9.2 fixture corpus**, ~12 focused fixtures (ADR-018): one per known
   defect class plus clean baselines.
6. **Then** `apps/web`: Jobs, Candidates, Shortlist. React 19 + Vite +
   Tailwind 4 + Radix, TanStack Query/Table.
7. Fastify API wiring core to web; launcher script (ADR-013); then the remaining
   directive phases (matrix, PDF report, optional LLM narrative, hardening).

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
