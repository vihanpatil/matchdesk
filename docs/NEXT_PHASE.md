# Next phase — first contact with reality

**Written:** 2026-08-17 · **Read `docs/SESSION_STATE.md` first.**
**Run `pnpm gate` before believing any status in any document, including this one.**

The user ran the product on their own resume — the first real document it has
ever seen. It failed twice in five minutes. Both failures are diagnosed below
**from measurement on the actual file**, not inference. This brief is the plan
to make the product usable.

**Perspective, stated honestly in both directions.** The engine did not show a
wrong number — the whole-document verdict on the resume was `English
(correct)`, C7 refused rather than mis-scored, and the gate criteria all still
hold. AND: the very first real CV was refused on the one line every real CV on
earth carries, and the resulting junk job could not even be deleted. A product
that is _safely_ unusable is still unusable. Fix order below is by user pain,
not by architectural interest.

---

## Failure 1 · A real CV's contact line refuses the whole document (H-116)

**Measured chain, each link verified on the real file:**

```
whole-document verdict:  isEnglish = TRUE  (correct)
flagged segments:        1 of 58 — line 1, the CONTACT line
bearing-token shape:     <Proper> <Proper> • • • <dotted> •
```

1. Line 1 of a real resume is `City, ST • (phone) • email • linkedin.com/in/…`.
2. `stripNeutralTokens` strips emails and URLs, but its URL pattern requires
   `https?://`. Real contact lines use **scheme-less domains**, so
   `linkedin.com/in/username` survives and `CASED_WORD` splits it into four
   junk "words".
3. That lifts the line past the 6-bearing-word floor, so the sub-floor `eld`
   pass judges it.
4. What it judges is a Spanish-origin US city plus **the candidate's own
   name** — H-112's finding ("a name is foreign text") arriving through the
   ADR-022 veto, which runs on _every_ line. ADR-034's header-block exclusion
   was applied only to the `unreadable_section` path, not here.

### The fix, two small changes plus the corpus that should have existed

- **F1 — dotted tokens are neutral.** Extend `stripNeutralTokens` to drop any
  token containing a `.` or `/` (scheme-less domains, paths, `Node.js`-style
  names). For _language judgement_ these carry no signal in any language.
  After F1, the measured contact line strips to ~4 bearing words — under the
  floor, never judged. This alone likely fixes the reported failure.
- **F2 — section-gate the veto's line pass.** `lineReadsNonEnglish` inside
  `findNonEnglishSegments` should skip lines **outside any recognised
  section**, exactly as ADR-034 does: the header block is where names and
  contact lines live, and it is where every measured false positive of this
  class has come from. Foreign _content_ inserts (degree lines — the H-041
  class) live inside sections and remain covered. Keep the function-word
  lexicon pass un-gated: it costs 0/258 and catches header-block Romance
  prose.
- **F3 — the corpus this failure proves is missing.** Add 10–15 real-shaped
  contact lines to the eval corpus: scheme-less `linkedin.com/…` and
  `github.com/…`, bullet separators, Spanish/Vietnamese/Chinese-origin US
  cities and names, pipe separators, multi-line headers. Synthetic values
  (ADR-014), real shapes. **H-111 already said hand-built corpora
  under-sample proper nouns and neutral tokens; this is the sixth instance of
  trap 1. Write the corpus before touching the code, and watch F1/F2 fail
  against it first** (ADR-028).

### Pass criteria — measured, not argued

- The real resume ingests as `scoreable` (user re-tests on their machine; the
  repo only ever holds the synthetic shapes).
- New contact-line corpus: **0 flagged**.
- All 23 English CVs + full fixture corpus: still 0 false refusals.
- All 13 non-English CVs: still refused.
- The H-041 sub-floor catches (9 languages, in-section degree lines): still
  caught — F2 must not reopen what ADR-034 closed. The `DOCUMENTED GAP` tests
  stay asserting their gaps.

---

## Failure 2 · Jobs cannot be deleted from the UI (H-117)

`DELETE /api/jobs/:id` exists, is tested, cascades, unlinks the file, audits.
**No UI element calls it.** The refused resume-as-job sat on the Jobs list
with no way to remove it — on a product whose PRODUCT_DECISIONS makes
explicit deletion part of the privacy boundary.

### The fix

- Delete button on the job page — **including the needs-attention branch**,
  which currently shows the warning and nothing else. That page is where
  deletion is most wanted (an unreadable document's only next steps are
  "replace the file" or "remove it").
- Same `window.confirm` guard as candidate delete, then navigate to `#/jobs`.
- While in there: the needs-attention job page should present the warning as
  guidance ("this document could not be read — fix the export or delete it"),
  not a dead end.

### Pass criterion

Upload any unreadable file as a job → open it → delete it → it is gone from
the list, its row and stored file are gone (verify via the existing API
test pattern), and an opaque audit entry exists.

---

## Why the browser verification missed both (do this differently)

The ADR-036 walkthrough **only ever added things**: upload → configure →
score → inspect. It never deleted anything, and it never uploaded a document
with a real-shaped contact header — the fixtures' headers are a bare name.
**A verification pass that never deletes cannot find a missing delete button**
(H-090's one-directional-testing shape, in UI form).

Next session's browser pass must walk the _destructive_ paths too: delete a
job, delete a candidate, re-upload after delete, refuse-then-delete. And the
fixture corpus should gain one CV whose header block looks like a real
resume's, so ingest-level regressions of the H-116 class fail a test rather
than a user.

---

## Working rules (unchanged, they keep earning it)

- Run `pnpm gate` and `pnpm verify` yourself; write the failing test first;
  quote `n/total`; trace every fix to what the recruiter sees.
- `HONESTY_LOG.md`/`findings.json` carry H-116 and H-117 — close them with
  tests that fail without the fix, then re-run the gate.
- The push remains **HELD**. Do not push without asking.
