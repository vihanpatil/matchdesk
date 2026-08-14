# Next phase — brief for a new session

**Written:** 2026-08-14 (supersedes the 2026-08-14 earlier brief) ·
**Read `docs/SESSION_STATE.md` first, then this.**
**Run `pnpm gate` before believing any status in any document, including this one.**

---

## 0. Start here

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
cd /Users/vihanpatil/personal/projects/Resume-Match/matchdesk
pnpm gate      # an exit code, not prose
pnpm verify    # ~1 min, must exit 0
```

**Gate at time of writing:** E1 not met (checklist), E2 not met (derived from
E5), E3 **MET**, E4 **MET** (80.96%), **E5 NOT MET — TWO blockers.**

**41 commits are unpushed and the user has HELD the push.** An ADR-014 content
scan is clean and on file. Do not push without asking.

---

## 1. The one thing to understand before doing anything

**A decision is waiting for the user. Do not start Task A until it is taken.**

The last session ran the language-ID library work the previous brief specified.
It measured 64 configurations and reached a clean, negative result:

> **`eld` cannot close H-041 without introducing false refusals, because the
> defect is a segmentation geometry problem, not a classifier accuracy problem.**

| granularity            | Germanic sub-floor caught | English CVs falsely refused | non-English refused |
| ---------------------- | ------------------------- | --------------------------- | ------------------- |
| `windows100` (current) | 0-1/13                    | **0/23**                    | 13/13               |
| `linePairs`            | 0-1/13                    | 0-1/23                      | 13/13               |
| `lines` + `reliable`   | **13/13**                 | **2/23**                    | 13/13               |

At the granularity that costs nothing, the library is blind to the class. At
the granularity that catches the class, it refuses two real English CVs
(`chef_terse`, `driver_very_terse`). A trailing sub-floor line **never forms a
window** under `lineWindows`' forward-growth rule — so swapping the classifier
was never going to fix it. Full measurement: **H-092**.

### The three options, and the precedent that constrains them

1. **Adopt `eld` at window granularity, accept H-041 stays open.**
   0/23 false refusals, 13/13 non-English refused, and it catches the H-079
   German header block in all 36 supplementary combinations **with no
   exemption**. This lets you **delete** the entire Cavnar & Trenkle apparatus
   _plus_ `MAX_ENGLISH_MEAN_WORD_LENGTH`, `ENGLISH_INSTITUTION_WORDS` and
   `MIN_FOREIGN_MARGIN` — three heuristics that exist only to patch the
   profiler's blind spots — at zero measured regression. **This is the only
   option that gets off the heuristic treadmill**, which is what Task A existed
   to do. Payload ~0.90 MB raw / ~0.26 MB gzip (`extrasmall` tier).
2. **Also add a line-granularity pass — closes H-041, costs 2/23 English CVs.**
   Gate-relevant: a wrong-score blocks E5, a false-refusal does not
   (`docs/findings.json` header). So this would flip E5 by **trading a blocking
   defect for a non-blocking one.** ⚠ **The user rejected exactly this trade at
   3/18 ≈ 17% in H-080.** 2/23 ≈ 8.7% is cheaper but the same shape. **Do not
   take this decision on the user's behalf.**
3. **Reject `eld`, fix the geometry instead.** The defect is that a trailing
   short line never forms a judgeable segment. That is a segmentation change,
   not a classifier change, and nobody has costed it.

**Ask the user. Do not threshold your way past this** — Task A's own
non-negotiable rule says an unclosable class goes to the user, not into another
threshold.

---

## 2. What the last session actually did

Nothing is committed to `apps/server/`. **`eld` is NOT installed** and **no ADR
was written** — deliberately, because approving a shipped dependency on an
unmeasured premise is the project's most-repeated failure one level up.

**Task B (extraction i18n) — LANDED.**

- `FIELD_VOCAB` 14 → 22 entries; `BE`/`M.E.` in Indian engineering fields now
  extract. `DEGREE_PATTERNS` untouched — the defect was the vocabulary.
- Bare `it`, `mechanical`, `civil`, `structural`, `instrumentation` were tested
  and **deliberately left out** — they collide with ordinary CV prose.
- `INDIAN_CV_CORPUS` (10 fixtures) in both tiers. Snapshot diff is **570
  insertions, 0 deletions**, proving no existing extraction moved.
- A committed **H-088 twin test** (Indian CV vs US-localised twin, identical
  education/skills/total and per-role tenure). None existed before; the claim
  had only ever been measured by hand.
- 701 passed / 2 expected-fail, verified by the lead, not taken on report.

**Task A (language ID) — measured, not integrated.** Survey + 64-config sweep.
Research preserved in `docs/research/langid-survey-2026-08-14/` and
`docs/research/langid-phase1-2026-08-14/` (the scratchpad is ephemeral). The
draft ADR is `ADR-031-DRAFT.md` in the first of those — **a draft, not a
decision.**

**Two new defects found, both logged and registered:**

- **H-089 — new E5 blocker.** An ambiguous numeric date range silently deletes
  a whole role. See §3.
- **H-090 — closed same session.** The B.4 fix landed with no test that failed
  without it.

**Falsified along the way (H-091):** the previous brief named `franc` first and
argued "a trained model works where character statistics cannot". `franc`
catches **10/13** — it is itself a trigram classifier, the same method as the
existing code. Adopting it on the strength of the argument would have shipped a
production dependency that does not fix the defect.

---

## 3. The work

### Task E — H-089: an ambiguous date silently deletes a role ⟶ blocks E5

**This is new, and it means closing H-041 alone will no longer reach E5 MET.**
If you only read one thing here, read this: the previous plan assumed one
blocker. There are two.

`DD/MM/YYYY` is standard in India. Measured:

| input                         | before           | after B.4         |
| ----------------------------- | ---------------- | ----------------- |
| `13/04/2019 - 15/08/2022`     | **`[]` dropped** | 3.3 years         |
| `13-04-2019 - 15-08-2022`     | **`[]` dropped** | 3.3 years         |
| `04/13/2019 - Present`        | **`[]` dropped** | correct           |
| **`03/04/2019 - 05/08/2022`** | **`[]` dropped** | **STILL DROPPED** |

B.4 fixed only the unambiguous case, using the one fact true in every locale: a
number in 13-31 cannot be a month. When **both** numbers are 1-12 the format is
genuinely ambiguous; the pattern is built so it _structurally cannot_ match
that shape, so it falls through unchanged.

The consequence: a two-sided ambiguous range **drops the entire role**, and the
recruiter is told a smaller total tenure with `warnings: []`.

**Pass criteria**

- `03/04/2019 - 05/08/2022` no longer silently deletes the role.
- **Do not resolve it by guessing a locale.** DD/MM is right for the target
  recruiter's Indian clients and wrong for US CVs, and the tool cannot tell
  which it is holding. H-040's remedy shape is the precedent: surface the
  disagreement (a blocking `Reservation`), never resolve it silently in
  arithmetic.
- Flip the `DOCUMENTED GAP` test at the end of `experience.test.ts`.

**Note the severity is the lead's alone so far.** ADR-027's precedent says a
gate call needs the independent verifier. **Route H-089 to #5 before treating
its classification as settled.**

### Task A — blocked on the §1 decision. Do not start it cold.

### Task B — landed. Residual: the four disciplines left out of `FIELD_VOCAB` on purpose.

### Task C — adversarial verification (ADR-015)

Runs after A and E land, against `docs/ATTACK_CHECKLIST.md`. Row **A5 (section
segmentation, PDF path) has never been run at all.** The verifier must not have
authored the work and must not be told the lead's expectations (H-069).
**Add H-089's classification to its docket.**

### Task D — UI, gated

`apps/web` does not exist. ADR-018 blocks it until E5 is MET. Shape already
agreed with the user: ranked list first, matrix second; 200×200 is a capacity
ceiling, never a rendered layout.

---

## 4. Housekeeping the last session did not do

- **`pnpm test:manifest` has not been run.** 69 tests were added (64 by Task B,
  5 by the lead). `scripts/test-floor.json` `minTests` is stale at 844 — the
  real number must come from a full-repo run, not a scoped one.
- **`pnpm verify` has not been run end-to-end since Task B landed.** Scoped
  runs were green (701 passed / 2 expected-fail) and `typecheck:tests`,
  `eslint` and `prettier` were clean on touched files. **Run the full thing
  before trusting anything.**
- **`pnpm mutate` (~14.5 min) has not been re-run** since E4 was measured at
  80.96%. New code landed in `education.ts` and `experience.ts`.

---

## 5. The tiger team

Same decomposition as before, with one correction learned the hard way.

| #   | Role                             | Model  | Touches                           |
| --- | -------------------------------- | ------ | --------------------------------- |
| 1   | **Tech lead**                    | Opus   | ADRs, both logs, gate, user comms |
| 2   | **Dependency & licence analyst** | Sonnet | docs only                         |
| 3   | **Language-detection engineer**  | Sonnet | `apps/server/src/ingestion/`      |
| 4   | **Extraction i18n engineer**     | Sonnet | `packages/core/src/extraction/`   |
| 5   | **Adversarial verifier**         | Opus   | read-only                         |
| 6   | **UI architect**                 | Sonnet | `apps/web/` — blocked until E5    |

**⚠ The decomposition is conflict-free by source directory but NOT by build.**
`pnpm typecheck` runs `tsc --build --clean` and `pnpm test:cov` writes a single
shared `coverage/`. Two agents running `pnpm verify` concurrently race and
produce evidence neither can interpret — the H-037 ambiguity shape. **Forbid
subagents from running `pnpm verify`, `pnpm typecheck`, `pnpm test:cov`,
`pnpm add` and `pnpm install`;** give them `pnpm exec vitest run <path>` and
`pnpm typecheck:tests` instead, and have the lead run the full verify once,
serialized. Likewise have dependency work install into an isolated directory
outside the repo, never into the workspace.

**Rules that are not negotiable** (unchanged): #5 did not author the work and
is not told the lead's view · every engineer measures against the corpora named
in their task · no engineer asserts a gate result · a finding is not closed
until a test fails without the fix · do not stack another heuristic on the
language detector.

---

## 6. Traps this project keeps falling into

Read before starting. Each has bitten more than once, and **two bit again last
session.**

1. **A corpus that lacks the population it will fail on** — H-022, H-079,
   H-086, H-088. Name your corpora before you measure.
2. **A guard that cannot fire** — H-060, H-070, **and H-090 last session**, one
   session after this line was written. Write the test that fails first. A
   behaviour change that leaves the test count unchanged has not been pinned.
3. **A figure carried across a change** — H-074, H-058. Quote `n/total`, never
   a percentage alone; re-run, never copy forward.
4. **A narrowing reported as a closure** — H-078, H-085.
5. **Abstention read as refusal** — ADR-027. Classify by what the _system_ does.
6. **A number measured at the wrong granularity** — **new, H-091.** The survey
   reported `eld` would falsely refuse 9/23 English CVs. All nine were
   proper-noun-only lines, and the production system never judges a bare line.
   The figure was arithmetically correct and described an architecture nobody
   proposed. **Check that a measurement's unit matches the system's unit before
   acting on it.**
