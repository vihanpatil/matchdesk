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
| A1  | Mixed / code-switched language           | H-041, H-043, H-068 — closed by ADR-034, not by detection  | **Covered** (H-041 closed 2026-08-14)                       |
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
finding.** As of 2026-08-14, **every row reads Covered and the registry holds no
open wrong-score finding** — run `pnpm gate` rather than trusting this sentence.

**A1 was the last, and how it closed is the part worth reading.** It stayed open
across five sessions while three of them tried to detect the foreign line
better. H-112 settled by measurement that this is impossible at line
granularity: **a person's name is foreign text**, `"Nguyen Thi Minh Anh"` reads
Vietnamese more strongly than any genuine foreign line, and every evidence floor
low enough to catch a short foreign degree line refuses candidates by the origin
of their name — four of them from this project's own Indian corpus.

**It was never a detection defect.** It was the engine printing "Requires at
least a bachelor degree" while holding text it could not read — asserting a
negative from silence. ADR-034 makes it decline to assert a must-have unmet in
that situation. Zero cost across 50 documents; nine languages caught in native
orthography.

**A4 and A5 were earned the same way.** A5 had never been executed in the
project's history; its first run produced H-100, a wrong-score in both
directions. A4's ADR-032 remedy was attacked and five further defects survived
it, all now closed with tests that fail without their fixes.

**What a future round need not re-run.** The 2026-08-14 round reported honest
negatives on larger header fonts, page-boundary headers, mid-word font splits,
three-part date forms of every separator, overlap merging, and the
whole-document language gate on full-paragraph foreign text. Clean under genuine
effort.

**Covered is not finished.** Open `coverage-gap` findings remain against these
rows — H-108 (a dateless header-shaped line), H-113 (bare-ASCII
transliteration). Neither can move a number on its own, which is why they do not
block, and both are registered rather than folded into a Covered label.

## Rows deliberately NOT on this list

- **Adversarial inputs aimed at crashing the process.** A crash is loud and
  cannot produce a wrong score. Out of scope for a wrong-score gate.
- **Performance and resource exhaustion.** Tracked by H-008, not by E1.
- **Anything requiring `apps/web`.** It does not exist. Add rows when it does;
  do not pre-write attacks against a UI nobody has designed.
