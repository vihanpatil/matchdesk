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

| #   | Attack class                             | Why it is here                                       | Status                     |
| --- | ---------------------------------------- | ---------------------------------------------------- | -------------------------- |
| A1  | Mixed / code-switched language           | H-041, H-043, H-068 — the open wrong-score defect    | **FINDING OPEN** (H-041)   |
| A2  | Invisible / homoglyph / RTL characters   | H-034, H-048 — fabricated skills, not just breakage  | Covered (DOCX only, H-067) |
| A3  | Degree and qualification ambiguity       | H-022, H-033, H-053 — "as", British forms, `X of Y`  | Covered                    |
| A4  | Date range and tenure arithmetic         | H-040 — **untriaged, may be wrong-score**            | **UNTRIAGED** (H-040)      |
| A5  | Section segmentation and header merging  | H-028 D1, H-062 — a merged header deletes a section  | **NOT RUN** (PDF path)     |
| A6  | Eligibility / must-have gate boundaries  | H-049, H-050, H-066 — empty jobs, negative weights   | Covered                    |
| A7  | Evidence span correctness                | H-028 D4, H-064, H-066 — in-bounds span, wrong place | Covered                    |
| A8  | Score reproducibility over time / inputs | H-052, ADR-024, H-002 — same inputs, same number     | **UNTRIAGED** (H-002)      |
| A9  | Unreadable or partial documents (C7)     | H-049 — an unreadable JOB scored candidates 100/100  | Covered                    |
| A10 | Certification identity and level         | H-063, H-066 — Associate vs Professional collapse    | Covered (argued)           |
| A11 | Format parity, PDF vs DOCX               | H-059, H-062, H-065 — same content, same score       | Covered (Phase 4)          |
| A12 | Numeric edge cases in scoring            | H-056 — `roundHalfUp` bound; renormalization         | Covered                    |

**E1 is MET when every row reads Covered and no row has an open wrong-score
finding.** Three rows do not: A1, A4, A8 — and A5 has never been run at all.

## Rows deliberately NOT on this list

- **Adversarial inputs aimed at crashing the process.** A crash is loud and
  cannot produce a wrong score. Out of scope for a wrong-score gate.
- **Performance and resource exhaustion.** Tracked by H-008, not by E1.
- **Anything requiring `apps/web`.** It does not exist. Add rows when it does;
  do not pre-write attacks against a UI nobody has designed.
