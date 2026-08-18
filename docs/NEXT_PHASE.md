# Next phase — a real pool, and the residual the last fix surfaced

**Written:** 2026-08-17 (updated same day after the H-116/H-117 fixes landed).
**Read `docs/SESSION_STATE.md` first.**
**Run `pnpm gate` before believing any status in any document, including this one.**

## What the previous version of this file planned — done, measured

The first-contact failures are fixed and closed in `HONESTY_LOG.md` /
`docs/findings.json`; the full plan and its measurements live there.

- **H-116 (contact line refused the document) — CLOSED.** Corpus first
  (ADR-028): a 15-header contact-line corpus watched failing 5/15, then F1
  (`stripNeutralTokens` drops tokens with `/` or an internal dot — the
  internal-only deviation from the original plan is stated in the log) took
  it to 0/15, and F2 section-gated the veto's `eld` line pass exactly as
  ADR-034 always did for `unreadable_section`. Three name-heavy header lines
  were watched failing post-F1 and closed by F2. The fixture corpus gained
  `h116-real-contact-header` (binary tier, verified failing on pre-fix code).
  **The user still needs to re-test their real resume on their own machine**
  — the repo only ever holds synthetic shapes (ADR-014).
- **H-117 (no way to delete a job from the UI) — CLOSED.** Delete job on all
  three job-page branches, confirm guard, needs-attention page is guidance
  rather than a dead end. The destructive browser walkthrough this file
  demanded was driven end-to-end (delete, cancelled confirm, candidate
  delete, re-upload after delete). En route, **H-118**: this file's own claim
  that the jobs DELETE endpoint "is tested" was false — no test exercised
  `deleteJob` until this session's e2e test. Closed same day.
- **H-119 — NEW, OPEN, the residual carved out of H-116's closure.**
  A lowercase-particle Hispanic name (`Maria del Carmen Gutierrez de la
Torre`) is still refused by the sub-floor lexicon pass, which F2
  deliberately left un-gated. `DOCUMENTED GAP` test pins it. H-028 D3's
  discrimination-adjacent shape: a candidate is refused in proportion to how
  Spanish their name's spelling is. **This is first in line below.**

---

## 1 · H-119 — separate a name's particles from Romance prose

The lexicon pass cannot be section-gated (it exists to catch header-block
Romance prose — a French cover line above the first section header). Closing
H-119 therefore needs a signal that separates `Maria del Carmen Gutierrez de
la Torre` from `Encadrement d une equipe de six personnes` on the same short
line. Candidate directions, none measured yet — measure before choosing
(H-115: do not let a name encode a hypothesis):

- **The corpus is built and the sweep is run** — evidence in
  `docs/research/h119-particle-names-2026-08-17/`. Measured on 10
  lowercase-particle names and 5 header-block Romance prose lines:
  **6 of 10 names are falsely refused today** (`Ana de la Cruz`,
  `Jose de la Torre`, `Maria del Carmen Gutierrez de la Torre`,
  `Lucia de los Santos del Rio`, `Carmen de la Fuente Ortiz`,
  `Amelie le Roux de Montfort`) — the gap is far wider than the one pinned
  name. All 5 prose lines are correctly refused.
- **Candidate rule, measured clean on this corpus ("rule C")**: for a line
  OUTSIDE any recognised section, the lexicon may only veto when the line
  also carries at least one lowercase token NOT in the lexicon. Every
  falsely-refused name has zero such tokens (its only lowercase words ARE
  the particles); every prose line has several (`equipe`, `personnes`,
  `oportunidad`, …). A pure narrowing of a veto — it cannot create a new
  refusal by construction, and in-section lines (the H-087 closed catches)
  are untouched by construction. Not landed yet: it was measured while an
  E4 run was in flight, and the implementing session should first widen the
  name corpus (Arabic `al-`/`bin`, Italian `di`/`della` names) before
  flipping the `DOCUMENTED GAP` test into a closure test (ADR-028: watch it
  fail first — it fails today).
- Whatever the fix, the H-106 corpus (17 English lines), the closed Romance
  catches (H-087), and the new contact-header corpus all still hold — they
  are the measured margin this lexicon lives inside.

## 2 · Use it against a real pool

Unchanged from before, now unblocked: real CVs, at volume, on the recruiter's
own machine — the fastest way to find what the corpus cannot (trap 1 has now
cost seven findings). Ask the user to run their real resume first (H-116's
final pass criterion), then a batch.

## 3 · Then, in rough order of value

- **The match matrix** — the agreed secondary view (PRODUCT_DECISIONS).
  200×200 stays a capacity ceiling, never a rendered layout.
- **Recruiter conveniences**: attribute suppression with rescore, job-local
  custom skills, background recompute with visible stale states.
- **Packaging** — a launcher that opens the browser.
- **UI rows for `ATTACK_CHECKLIST`** — the UI exists and now has destructive
  controls; attack them (wrong-id DELETE, double delete, delete during
  scoring).

---

## Working rules (unchanged, they keep earning it)

- Run `pnpm gate` and `pnpm verify` yourself; write the failing test first;
  quote `n/total`; trace every fix to what the recruiter sees.
- Browser passes walk the destructive paths too — the rule is now in
  SESSION_STATE's "How to work on this codebase".
- The push remains **HELD**. Do not push without asking.
