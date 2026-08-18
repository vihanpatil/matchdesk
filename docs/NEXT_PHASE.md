# Next phase — a real pool

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
- **H-119 — CLOSED (second session, same day).** Rule C landed corpus-first:
  the name corpus widened to 14 particle shapes (es/pt/it/nl/fr/ar), watched
  failing 8/14, then 0/14 with all five header-block Romance-prose guards
  intact. Out-of-section, the lexicon may only veto when the line carries a
  lowercase non-lexicon token; in-section is untouched, so the H-087 catches
  cannot reopen. Evidence: `docs/research/h119-particle-names-2026-08-17/`.
- **D7 — CLOSED (second session).** `PRAGMA recursive_triggers = ON` shuts
  the `INSERT OR REPLACE` audit-rewrite bypass ADR-018 D4 named, failing
  test first; both missed statement forms now pinned.

---

## 1 · Use it against a real pool

Real CVs, at volume, on the recruiter's own machine — the fastest way to
find what the corpus cannot (trap 1 has now cost seven findings). The user
runs their real resume first (H-116's final pass criterion), then a batch.
Nothing known blocks this: zero open false-refusal or integrity findings.

## 2 · Then, in rough order of value

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
