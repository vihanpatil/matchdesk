# Next phase — brief for a new session

**Written:** 2026-08-14 · **Read `docs/SESSION_STATE.md` first, then this.**
**Run `pnpm gate` before believing any status in any document, including this one.**

---

## 0. Start here

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
cd /Users/vihanpatil/personal/projects/Resume-Match/matchdesk
pnpm gate      # E5/E2, computed from docs/findings.json — an exit code, not prose
pnpm verify    # ~1 min, must exit 0
```

**Gate at time of writing:** E1 not met (checklist), E2 not met (derived from
E5), E3 **MET**, E4 **MET** (80.96%), E5 **NOT MET — one blocker**.

**36 commits are unpushed and the user has HELD the push.** An ADR-014 content
scan is clean and on file. Do not push without asking.

---

## 1. Does the tool work for Indian candidates? — verified 2026-08-14

**Yes for everything except part of education, and that part is now fixed.**

Measured end-to-end: an Indian-English CV (Infosys, TCS, Bengaluru,
`Jul 2021 - Present`, IIT Kharagpur) and its US-localised twin both score
**100 / eligible, identically**. Language detection, skills, employers and
tenure all handle Indian content correctly.

Education did not, and it was rejecting real people:

| qualification                | before                     | after               |
| ---------------------------- | -------------------------- | ------------------- |
| B.E. (Anna University)       | edu=0 → **50, INELIGIBLE** | bachelor ✓          |
| MCA / BCA                    | edu=0 → **50, INELIGIBLE** | master / bachelor ✓ |
| PGDM (XLRI)                  | edu=0 → **50, INELIGIBLE** | master ✓            |
| B.Tech / M.Tech / MBA / B.Sc | already worked             | ✓                   |

The tool was telling the recruiter that a candidate holding a bachelor's degree
had no bachelor's degree. Fixed in `468fb25` (H-088).

**Known residual, and it is Task B below:** a bare `BE`/`M.E.` needs
corroborating context, and the only corroboration is a recognised field or the
literal word "degree". `FIELD_VOCAB` has **14 US-skewed entries**, so
**"Electronics and Communication" and "Structural Engineering"** — two of the
commonest Indian engineering disciplines — do not qualify. The same degrees
parse the instant the field is recognised, so **the defect is the vocabulary,
not the patterns.**

---

## 2. What this session actually did

12 commits, **794 → 844 tests**, 4 ADRs (027–030), 20 log entries (H-069–H-088).

**The structural change, which is the one that matters:**

Before, three of five gate criteria were opinions, and they never converged —
E5 went MET → disputed → NOT MET and E2 went NOT MET → MET → NOT MET **without
the source code changing**. Every session re-read 74 prose entries and formed a
fresh judgement. That was the "solve, re-solve, solve again" loop.

`pnpm gate` now computes E5 from `docs/findings.json`. **Changing a gate result
requires editing a tracked file that shows up in a diff.** E5 blockers went
3 → 1 and have stayed measurable ever since.

**Two defects that produced wrong numbers for real people, both fixed:**

- **H-040** — the same person scored 19.6 years/100/eligible or 2.9
  years/66/**ineligible** depending on whether an old employer wrote
  `Mar 2006` or `03.2006`. The engine extracted a 20-year claim, discarded it,
  and reported 2.9 as fact.
- **H-088** — Indian degrees, above.

**H-041 narrowed twice**, from "silent on most real CVs" to one bounded case.

**Honest counterweight — why it still feels slow.** Three sessions have gone
into one defect class, and each narrowing revealed a new residual: prose gate →
biased against German → letter floor → German classifier itself wrong →
compounding signal → falsely refused Indian CVs → fixed → sub-floor inserts
still open. **That is heuristic-stacking, and it is the actual problem.** Each
step was measured and each was real, but the shape is a treadmill. Task A exists
to get off it: replace the stack with one trained model.

**Four times this session** a component turned out to be calibrated on a corpus
that lacked the population it then failed on — H-022 (American degree forms),
H-079 (English/Romance prose), H-086 (no Indian CVs), H-088 (American degree
forms again, same file as H-022). **This is the single most repeated failure in
the project.** Every task below therefore names the corpora it must be measured
against, and that is not optional.

---

## 3. The work

### Task A — close H-041 with a real language-ID library ⟶ unblocks E5

**Why:** the remaining blocker is a Germanic-language insert shorter than ~100
letters. Germanic compound lines carry **no function words** (measured: zero
hits on DE/NL/SV header lines), and mean word length does not separate at line
level — English lines reach **11.3** ("Additional: Conversational Portuguese")
against a German degree line at **10.2**. Attempting it costs ~17% of documents,
the cost H-080 already ruled out. A trained model works on short fragments where
character statistics cannot. This is the "different method" H-041 named at the
very start.

**Deliverables**

1. **Candidate survey** — `franc`, CLD3 (wasm), `tinyld`, and any current
   alternative. For each: size, dependency count, last publish, **and the actual
   LICENSE file read**, per ADR-016. "Probably MIT" is not evidence.
2. **A dependency ADR in ADR-026's shape** — approve or reject, with
   supply-chain cost stated. Production dependency, not dev-only: this ships to
   the recruiter, so the licence bar is the strict allowlist.
3. **Integration behind the existing seam.** `findNonEnglishSegments` already
   returns `MixedLanguageResult`; keep that contract so `extractText` and the
   pipeline are untouched.
4. **Measurement, before it replaces anything**, against **all** of:
   `ENGLISH_CVS` (8), `HELD_OUT_ENGLISH_CVS` (10), **`INDIAN_ENGLISH_CVS` (5)**,
   `NON_ENGLISH_CVS` + `HELD_OUT_NON_ENGLISH_CVS` (13), plus the sub-floor
   adversarial cases in the eval file.
5. **Delete what it replaces.** If the library subsumes the compounding signal
   or the function-word lexicon, remove them. Do not leave two mechanisms.

**Pass criteria (all measured, none argued)**

- 0 false refusals across all **23** English CVs, Indian included.
- All 13 non-English CVs still refused.
- The Germanic sub-floor insert asserted as a documented gap in
  `languageDetection.eval.test.ts` now **caught**; flip that test deliberately.
- `pnpm verify` exit 0; `pnpm gate` shows **E5 MET**.

**Explicitly out of scope:** identifying _which_ language. ADR-006 needs
English-vs-not only.

---

### Task B — international extraction: finish what H-088 started

**Why:** the recruiter works with Indian clients. `FIELD_VOCAB`'s 14 US-skewed
entries currently block `BE`/`M.E.` recognition, and the same narrowness will
hit every non-US market.

**Deliverables**

1. **Expand `FIELD_VOCAB`** to cover Indian engineering disciplines at minimum:
   Electronics and Communication, Electrical and Electronics, Structural,
   Mechanical, Civil, Instrumentation, Information Technology, Information
   Science, Biotechnology.
2. **An `INDIAN_CV_CORPUS`** in the fixture corpus — realistic synthetic CVs
   (ADR-014: synthetic only) covering B.E./B.Tech/MCA/BCA/PGDM, Indian
   employers, and Indian date formats.
3. **Flip the documented-gap test** in `education.test.ts` that currently
   asserts `BE in Electronics and Communication` extracts nothing.
4. **Check Indian date formats** — `DD/MM/YYYY` and `DD-MM-YYYY` are standard
   in India and `experience.ts` is documented as having date-format locale
   assumptions. **Measure before assuming it works**; H-040 was exactly this
   defect for European formats.

**Pass criteria**

- All 17 qualification forms in H-088's table extract correctly.
- An Indian CV and its US-localised twin score identically — the H-088 test.
- No false degrees from ordinary prose; the `be`/`me` guards still hold.

---

### Task C — adversarial verification (ADR-015)

Runs **after** A and B land, against `docs/ATTACK_CHECKLIST.md`. Row **A5
(section segmentation, PDF path) has never been run at all.**

The verifier must **not** have authored A or B, and must **not** be told the
lead's expectations — see H-069 for why that mattered.

---

### Task D — UI, gated

`apps/web` does not exist. **ADR-018 blocks UI work until extraction is
hardened**, and E5 is the measure of that. Starts when `pnpm gate` shows E5 MET.

Agreed shape, already decided with the user:

- **Ranked list first, matrix second.** Pick a job → candidates ranked, eligible
  and ineligible grouped separately, evidence on click.
- **200×200 is a capacity ceiling, never a rendered layout.** 15 jobs × 3 CVs
  renders 45 cells sized to content. Virtualization engages only when the data
  needs it. Compute is not the bottleneck (0.34 s full fill, H-046).

---

## 4. The tiger team

Per ADR-004, extended for parallelism. **The decomposition below is
conflict-free by construction** — A touches `apps/server/src/ingestion/`, B
touches `packages/core/src/extraction/`, C writes docs only, D is read-only
until it reports.

| #   | Role                             | Model  | Owns                                                       | Touches                                                    | Runs                        |
| --- | -------------------------------- | ------ | ---------------------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| 1   | **Tech lead**                    | Opus   | ADRs, both logs, gate assertions, all user comms           | `DECISIONS.md`, `HONESTY_LOG.md`, `docs/`, `findings.json` | throughout                  |
| 2   | **Dependency & licence analyst** | Sonnet | Task A.1–A.2 — survey, read every LICENSE, draft the ADR   | docs only                                                  | **first, alone**            |
| 3   | **Language-detection engineer**  | Sonnet | Task A.3–A.5 — integrate, measure, delete what it replaces | `apps/server/src/ingestion/`                               | after #2 approves a package |
| 4   | **Extraction i18n engineer**     | Sonnet | Task B — `FIELD_VOCAB`, Indian corpus, date formats        | `packages/core/src/extraction/`                            | **parallel with #3**        |
| 5   | **Adversarial verifier**         | Opus   | Task C — falsify the gate claim, work the checklist        | read-only, then a report                                   | after #3 and #4 land        |
| 6   | **UI architect**                 | Sonnet | Task D                                                     | `apps/web/`                                                | **blocked until E5 MET**    |

**Sequencing**

```
#2 licence survey ──► #3 language integration ──┐
                                                ├──► #5 adversarial ──► gate ──► #6 UI
#4 extraction i18n ─────────────────────────────┘
        (#3 and #4 run in parallel — different packages, no shared files)
```

**Rules that are not negotiable**

- **#5 did not author #3's or #4's work, and is not told what the lead expects.**
  H-069 is the precedent: withholding the lead's view is the only thing that
  makes an independent verdict worth having.
- **Every engineer measures against the corpora named in their task.** Four
  defects this session came from skipping exactly that.
- **No engineer asserts a gate result.** Only `pnpm gate` does, and only the
  lead edits `findings.json`.
- **A finding is not closed until a test fails without the fix.** That is E2's
  definition of "pinned" (ADR-028).
- **Do not stack another heuristic on the language detector.** If the library
  cannot close the class, say so and stop — that decision goes to the user, not
  into another threshold.

---

## 5. Traps this project keeps falling into

Read before starting. Each of these has bitten more than once.

1. **A corpus that lacks the population it will fail on** — H-022, H-079,
   H-086, H-088. Name your corpora before you measure.
2. **A guard that cannot fire** — H-060, H-070. R-L1 named length as its defect
   axis and then held length constant. Write the test that fails first.
3. **A figure carried across a change** — H-074, H-058. Quote `n/total`, never
   a percentage alone; re-run, never copy forward.
4. **A narrowing reported as a closure** — H-078, and nearly H-085. Run the
   adversarial round _before_ claiming a class is closed.
5. **Abstention read as refusal** — ADR-027. When a guard says nothing, classify
   by what the _system_ then does.
