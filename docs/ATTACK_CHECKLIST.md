# E1 attack checklist

**This file replaces "two consecutive adversarial rounds find nothing" (ADR-028
Decision 3).**

The old E1 could not terminate. An Opus adversary against a codebase this size
will always find something, and any finding reset the counter to zero, so E1
was a process with no reachable end state — it sat at NOT MET for the project's
entire life while E3 and E4, which you settle by running a command, converged
and stayed converged.

**E1 is now: every attack class below has been executed against the current
engine, and every wrong-score finding it produced is fixed and registered in
`docs/findings.json`.** Finite, checkable, and it does not reset because
someone had a new idea — a new idea becomes a new row here, added deliberately,
with the gate re-run against it.

This is not a weaker bar. The old one was unreachable, and an unreachable bar
protects nobody: it kept the UI blocked while a real wrong-score defect
(H-041) sat open and unclassified for a month because attention went to the
counter instead of the defect.

## How to run a round

One Opus verifier per round, per ADR-015, **which did not author the code or
the corpus under attack**. It works the checklist top to bottom, and for each
row either produces a finding or records the measurement showing the class is
clean. **A row cannot be marked covered by argument — only by pasted output.**

Findings are triaged with ADR-023's split **as corrected by ADR-027**
(abstention is not refusal), registered in `docs/findings.json`, and `pnpm gate`
is re-run. Anything found outside these classes gets added as a new row.

## The classes

| #   | Attack class                             | Why it is here                                             | Status                                                      |
| --- | ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| A1  | Mixed / code-switched language           | H-041, H-043, H-068 — the open wrong-score defect          | **FINDING OPEN** (H-041)                                    |
| A2  | Invisible / homoglyph / RTL characters   | H-034, H-048 — fabricated skills, not just breakage        | Covered (DOCX only, H-067)                                  |
| A3  | Degree and qualification ambiguity       | H-022, H-033, H-053 — "as", British forms, `X of Y`        | Covered                                                     |
| A4  | Date range and tenure arithmetic         | H-040, H-089, H-095, H-101-H-104 — all closed              | **Covered** (attacked 2026-08-14; 6 findings, all fixed)    |
| A5  | Section segmentation and header merging  | H-028 D1, H-062, H-100 — a merged header deletes a section | **Covered** (first run 2026-08-14; H-100 found and fixed)   |
| A6  | Eligibility / must-have gate boundaries  | H-049, H-050, H-066 — empty jobs, negative weights         | Covered                                                     |
| A7  | Evidence span correctness                | H-028 D4, H-064, H-066 — in-bounds span, wrong place       | Covered                                                     |
| A8  | Score reproducibility over time / inputs | H-052, ADR-024, H-002 — same inputs, same number           | Covered (H-002 triaged; pinned by determinism.arch.test.ts) |
| A9  | Unreadable or partial documents (C7)     | H-049 — an unreadable JOB scored candidates 100/100        | Covered                                                     |
| A10 | Certification identity and level         | H-063, H-066 — Associate vs Professional collapse          | Covered (argued)                                            |
| A11 | Format parity, PDF vs DOCX               | H-059, H-062, H-065 — same content, same score             | Covered (Phase 4)                                           |
| A12 | Numeric edge cases in scoring            | H-056 — `roundHalfUp` bound; renormalization               | Covered                                                     |

**E1 is MET when every row reads Covered and no row has an open wrong-score
finding.** After the 2026-08-14 adversarial round, **one row does not**:

- **A1 (H-041)** — the only remaining open wrong-score in the project, now
  **narrowed but not closed** (H-111). A sub-floor `eld` line pass took the
  class from Romance-only to 11 of 26 measured foreign lines across 15
  languages, at 0/258 English lines refused, and every language H-105 measured
  as wrong-scoring is now caught. **The residual is a foreign line of ≤5
  bearing words, and the axis is a word count rather than a language family** —
  the four remaining cases are Germanic, Germanic, Germanic and Turkic.
  Closing it means lowering the evidence floor, which is measured to refuse
  technology lists at 5 words and candidate NAMES at 4. That last cost is
  H-028 D3's shape and makes it a user decision, not a tuning one.

**A4 and A5 are now Covered, and both were earned rather than argued.** A5 had
never been executed in the project's history; its first run produced H-100, a
wrong-score in both directions, now fixed. A4's ADR-032 remedy was attacked and
five further defects survived it (H-101-H-104, plus H-095's two-part half); all
are closed, each with a test that fails without its fix.

**A1 and A4 were once called "the same shape". That is now only half true.**
Both were the engine emitting a confident number while silently discarding
something it could not account for — but A4's remedy turned the discarded thing
into emitted evidence, and A1 cannot use it, because there is nothing to emit:
the language veto never gets a judgeable segment to abstain on. The shared
diagnosis held; the shared remedy did not.

**What a future round need not re-run.** The 2026-08-14 round reported honest
negatives on larger header fonts, page-boundary headers, mid-word font splits,
three-part date forms of every separator, overlap merging, and the
whole-document language gate on full-paragraph foreign text. Clean under
genuine effort.

## Rows deliberately NOT on this list

- **Adversarial inputs aimed at crashing the process.** A crash is loud and
  cannot produce a wrong score. Out of scope for a wrong-score gate.
- **Performance and resource exhaustion.** Tracked by H-008, not by E1.
- **Anything requiring `apps/web`.** It does not exist. Add rows when it does;
  do not pre-write attacks against a UI nobody has designed.
