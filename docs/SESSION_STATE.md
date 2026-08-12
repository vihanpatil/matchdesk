# Session State — read this first

**Purpose:** let any new session resume without re-deriving context. Updated at
the end of every working session. If this file disagrees with the code, **the
code is right and this file is a bug** — fix it.

**Last updated:** 2026-08-12

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

## 2. Current status

**Phase 0 (Foundation): COMPLETE**, gate evidence pasted and independently
verified. CI green on ubuntu.

**Thin vertical slice (ADR-011): IN PROGRESS.**

| Area                        | State                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `packages/core`             | Taxonomy, extraction with spans, cascade steps 1–3, eligibility, explanation — built |
| `apps/server`               | SQLite, migrations, repositories, dedup, file store, PDF/DOCX ingestion — built      |
| `apps/web`                  | **NOT STARTED** — next major piece                                                   |
| Embeddings (cascade step 4) | Deliberately deferred, typed seam exists                                             |
| OCR                         | Deliberately deferred                                                                |

**364 tests.** `packages/core` 99.81% lines / 94.48% branches (bar 90/90).
`apps/server` ~96% / ~88% (bar 75).

**IN FLIGHT at time of writing:** ADR-017 implementation (must-haves must both
score and partition). See H-025 — this was falsely claimed as done in commit
`6524826` and is being genuinely implemented now. **Verify its real behaviour
before trusting any claim that it is finished.**

---

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

**After adding tests you MUST** run `pnpm test:manifest` and bump `minTests` in
`scripts/test-floor.json`, or CI fails.

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

| ID    | Item                                                         | Why it matters                                                                           |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| H-002 | Cross-machine determinism not guaranteed                     | Limits C4; mitigated by 6dp quantization, not solved                                     |
| H-007 | LLM output validator cannot do what Section 7 literally asks | Entity-grounding catches fabricated entities, not fabricated relations                   |
| H-008 | OCR throughput and matrix first-fill budgets unmeasured      | Section 11 numbers may be unachievable                                                   |
| H-014 | Production license tier has never rejected anything          | Resolves as real prod deps accumulate                                                    |
| H-015 | `--no-verify` bypasses hooks                                 | Unfixable client-side; CI is the backstop                                                |
| H-020 | Stale `dist/` survives a failing compile                     | Currently unreachable; **goes live when `apps/server` imports `@matchdesk/core`**        |
| H-023 | Language detection calibrated on **two** documents           | Load-bearing for ADR-006; a false negative scores a document we cannot read (C7 failure) |

**Known extraction gaps, reported but not fixed** (same shape as H-022):

- UK secondary/vocational: A-Level, GCSE, HND, Foundation Degree, BTEC, NVQ
- Postgraduate: PGDip, PGCE
- Non-English degrees: Licenciatura, Laurea, Diplom, Bacharelado
- `FIELD_VOCAB` is a 14-entry US/English-skewed list — `field` returns null for
  many real majors
- Date-format locale assumptions likely in `experience.ts`

---

## 6. The failure pattern this project keeps hitting

**Read this before trusting any green number.** Four separate times, a passing
metric has concealed a real defect:

| Entry | The green signal          | What it concealed                                                                     |
| ----- | ------------------------- | ------------------------------------------------------------------------------------- |
| H-004 | 100% coverage             | The measured file set was quietly too small                                           |
| H-013 | 100% branch coverage      | Four untested behaviours in one guard (v8 does not count `\|\|` operands as branches) |
| H-022 | 93% branch coverage       | Every test used American degree conventions; `BSc` extracted as nothing               |
| H-025 | All tests, lint, CI green | A commit claiming work that was never done — no test can fail for absent work         |

The generalisable lesson: **coverage measures which lines ran, never whether the
inputs were representative — and no automated gate can detect a false claim.**
This is why the Section 9.2 fixture corpus, with its deliberate spread of
conventions and adversarial cases, is load-bearing rather than ceremony.

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

1. **Finish ADR-017** and verify against live behaviour, not against the
   document (H-025).
2. **Run the Opus adversarial verifier** over the whole slice — per ADR-015 this
   is a gate, and the slice has never been independently falsified.
3. **Build `apps/web`**: Jobs, Candidates, Shortlist (the three screens chosen
   for the slice). React 19 + Vite + Tailwind 4 + Radix, TanStack Query/Table.
4. **Fastify API** wiring core to web.
5. **Launcher script** per ADR-013.
6. Then loop back for rigour: fixture corpus, OCR, embeddings, remaining screens.

---

## 9. Team

Per ADR-004: Opus tech lead (owns architecture, gates, both logs, all user
communication) + Sonnet engineers scoped to one package each + **an Opus
adversarial verifier whose job is to falsify gate claims, not confirm them.**

The verifier has falsified a gate claim **three times**, including two
regressions the lead introduced — one of which repeated a trap the lead had
already written down. It is the highest-value role on the team. Do not skip it.
