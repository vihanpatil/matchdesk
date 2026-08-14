# ADR-031 (DRAFT) — Language-ID library for the Germanic sub-floor gap

**Prepared by:** Dependency & licence analyst (role #2), tiger team, per
`docs/NEXT_PHASE.md` Task A.1–A.2. **Not yet in `DECISIONS.md` — the tech lead
owns that file and folds this in.** All measurement artifacts (corpora,
runner script, raw output) live at
`<scratch>/dep-analyst/spike/` — see the reporting section at the bottom for
exact paths.

**Date:** 2026-08-14 · **Status:** DRAFT, pending tech-lead review

---

## Rationale

E5 has one open blocker: `apps/server/src/ingestion/languageDetection.ts`
cannot separate English from a Germanic (German/Dutch/Swedish) insert shorter
than the ~100-letter window floor. The existing sub-floor pass
(`NON_ENGLISH_FUNCTION_WORDS`) catches Romance inserts because Romance
function words survive at 3–5 words; German/Dutch/Swedish compound-noun CV
lines carry **zero** function words, so that lexicon structurally cannot see
them (`languageDetection.ts:480-503`). `docs/SESSION_STATE.md` and
`docs/NEXT_PHASE.md` both frame the proposed fix as "a trained model works on
short fragments where character statistics cannot" and name this as the
"different method" H-041 called for from the start.

**`docs/NEXT_PHASE.md` §4 states this premise must be measured, not
assumed**, because `franc` — one of the three named candidates — is *also* a
trigram classifier, the same family of method as the detector already in the
repo. If the premise is false, the honest outcome is to say so and stop. It
is not false for every candidate, but the spike below finds the premise is
**incomplete** in a way the brief anticipated but did not predict the shape
of: a trained model closes the Germanic catch-rate gap cleanly, but at the
real operating point (raw single CV lines, no gating) it opens a **different,
comparably-sized false-refusal class** the current architecture does not
have today — concentrated almost entirely on isolated proper-noun-only lines
(candidate name headers, Indian institution-name lists). That finding, not a
license technicality, is the center of this ADR.

---

## Deliverable 1 — candidate survey

All candidates installed into an isolated npm project outside the repo:
`<scratch>/dep-analyst/spike/` (`npm init -y && npm install --save-exact
franc@6.2.0 franc-min@6.2.0 franc-all@7.2.0 tinyld@1.3.4 cld3-asm@4.0.0
eld@2.1.0`). Sizes are `du -sh` on the isolated `node_modules/<pkg>`
directory; "resolved tree" is every package `npm ls --all` reports under it.

| Candidate | Version (pinned) | Last publish | Install size | Direct deps | Full resolved tree | Runtime model | Documented min. input |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `franc` | 6.2.0 | 2024-01-11 | 292 KB (+24 KB `trigram-utils`) | 1 | 4 pkgs: `franc`, `trigram-utils@2.0.1`, `collapse-white-space@2.1.0`, `n-gram@2.0.2` | Pure JS, trigram frequency model, same family as the repo's own detector | `minLength` option, default **10 characters**; below it returns `'und'` |
| `franc-min` | 6.2.0 | 2024-01-11 | 148 KB (+24 KB) | 1 | Same 4-pkg tree (fewer languages baked into `data.js`) | Same | Same, default 10 chars |
| `franc-all` | 7.2.0 | 2024-01-11 | 616 KB (+24 KB) | 1 | Same 4-pkg tree (all languages) | Same | Same, default 10 chars |
| `tinyld` (light/normal/heavy) | 1.3.4 | 2024-01-12 | 12 MB unpacked (dist alone 8.2 MB: light 69 KB / normal 591 KB / heavy 2.09 MB per-build minified file; package also ships a 3.5 MB browser playground demo not needed at runtime) | **0** | **1 pkg** — zero dependencies, declared and confirmed | Pure JS, own n-gram model, three precision/size tiers via separate entry points | Not documented as a hard floor; README claims short-text reliability. Empirically returns `''` (undetermined) rather than throwing on empty/short input (measured below) |
| `cld3-asm` | 4.0.0 | 2023-12-31 (**~2.6 years stale** relative to 2026-08-14) | 6.5 MB standalone, 7.1 MB with tree | 1 | **8 pkgs**: `cld3-asm`, `emscripten-wasm-loader@3.0.3`, `getroot@1.0.0`, `tslib@1.14.1`, `nanoid@2.1.11`, `unixify@1.0.0`, `normalize-path@2.1.1`, `remove-trailing-separator@1.1.0` | WebAssembly binding to Google's compiled CLD3 neural model (asm.js-format compiled module, ~1 MB × 4 build variants) | No documented floor; `create(minBytes, maxBytes)` lets the caller set a byte-length window. Empirically always returns a guess with a probability + `is_reliable` flag, never throws, even on `""` |
| `eld` (`eld/large`) | 2.1.0 | 2026-08-13 (package has existed since 2023-05-31, 15 published versions, active) | 8.7 MB unpacked (ships all four size tiers: large 4.3 MB / medium 1.9 MB / small 1.5 MB / extrasmall 932 KB — only the imported tier is loaded at runtime) | **0** | **1 pkg** — zero dependencies, declared and confirmed | Pure JS ("100% JavaScript (vanilla)" per its own README), own n-gram model, four precision/size tiers | Not documented as a hard floor; README states "reliable even for really short texts." Empirically returns `''` for `""`, never throws |

**Also surveyed and excluded before spiking:**

- **`cld3` (native bindings, `cld3@2.0.6`, last published 2023-11-03).**
  Depends on `bindings`, `cmake-js`, `node-addon-api` — a native addon
  requiring a C++ toolchain and `cmake` at install time. This is a materially
  larger "cost to state" than a WASM/asm.js binding: it can fail
  `pnpm install` on a recruiter's machine with no compiler present, which
  directly works against ADR-013's "any recruiter can use this" goal. Not
  spiked; `cld3-asm` already covers the same underlying CLD3 model without
  this cost.
- **`@vscode/vscode-languagedetection@1.0.23`.** Its own npm description:
  "uses guesslang's ML model to detect **source code languages**." This is a
  programming-language classifier (Python vs. JavaScript vs. Go), not a
  natural-language identifier. Wrong tool for ADR-006's English-vs-not
  question; excluded on inspection, not measured.
- **`lande`, `languagedetect`, `guess-language`** — searched, found stale
  (`lande` last published 2023-01-20 with no update since) or lower quality
  by inspection of their own READMEs; not spiked given `eld` and `tinyld`
  already dominate on every measured axis below.

**Supply-chain observation, unrelated to the license question but relevant to
choosing among otherwise-similar candidates:** `franc`/`franc-min`/`franc-all`
ship **no `LICENSE` file inside the published npm tarball** — confirmed by
listing the installed package directory
(`node_modules/franc/`, `node_modules/franc-min/`, `node_modules/franc-all/`
all lack a `license`/`LICENSE` file). The MIT declaration was verified instead
by fetching `https://raw.githubusercontent.com/wooorm/franc/main/license`
directly from source, which returns a genuine MIT license text (Titus Wormer,
2014, plus historical Kent S Johnson / Jacob R Rideout / Maciej Ceglowski
copyright lines). This is not a licensing violation — SPDX metadata plus a
verified upstream source is adequate evidence — but it means the audit script
cannot verify this package by reading a file inside `node_modules`, only by a
one-time out-of-band check, which is worth the tech lead knowing before
trusting `pnpm licenses list` output for this family blindly.

---

## Deliverable 2 — the empirical spike

**Script and corpora:** `<scratch>/dep-analyst/spike/measure.mjs` and
`<scratch>/dep-analyst/spike/corpora.mjs`. Raw run output:
`<scratch>/dep-analyst/spike/out4.txt`. Run with the pinned Node
(`nvm use 24.19.0`) via `node measure.mjs` from the spike directory.

**Corpora used, exactly as specified:**

- **English lines (96 total):** every non-blank line of `ENGLISH_CVS` (8),
  `HELD_OUT_ENGLISH_CVS` (10) and `INDIAN_ENGLISH_CVS` (5) — 23 CVs, 96 lines
  — copied verbatim from
  `apps/server/src/ingestion/languageDetection.eval.test.ts` (read
  2026-08-14). Must classify English; a non-English or "undetermined" verdict
  is a false refusal.
- **Germanic sub-floor lines (13 total):** the exact `DOCUMENTED GAP` string
  from `languageDetection.eval.test.ts:597` (`"Kenntnisse: Lagerverwaltung,
  Bedarfsplanung"`) plus 12 more constructed in the same shape as the
  existing DE/NL/SV header blocks already in the repo's eval file and
  `languageDetection.ts` comments (CV header/skill/degree lines, 3–8 words,
  real compound nouns in the warehouse/logistics/engineering/business
  domain, no function words, title-cased the way a CV header reads). Each
  was checked by hand against a bilingual dictionary rather than
  machine-translated from one source sentence, so they are not near-
  duplicates of each other or of the repo's existing examples. Full text in
  `corpora.mjs`. Must classify non-English; an English or "undetermined"
  verdict is a miss.
- **Known hard English lines:** `"Additional: Conversational Portuguese"`
  (the mean-word-length-11.3 case named in `languageDetection.ts:406` and
  `ADR-030`) plus the two `headers_plus_tech_only` lines.
- **Below-minimum-length behaviour:** `""`, `"a"`, `"OK"`, `"Hi"`, `"Java"`,
  `"123"`, `"BE"`, `"CV"`.

### Results table — `n/total`, never a bare percentage

| Candidate | False refusals / English lines | English CVs with ≥1 falsely-refused line | Germanic sub-floor caught | Threw on short/garbage input | Below-min-length behaviour |
| --- | --- | --- | --- | --- | --- |
| `franc` | 47/96 | 15/23 | 10/13 | 0/8 | Returns `'und'` cleanly below 10 chars |
| `franc-min` | 40/96 | 15/23 | 10/13 | 0/8 | Returns `'und'` cleanly |
| `franc-all` | 52/96 | 15/23 | 11/13 | 0/8 | Returns `'und'` cleanly |
| `tinyld/light` | 53/96 | 14/23 | **13/13** | 0/8 | Returns `''` (undetermined) cleanly, except guesses `en` on the 2-char string `"BE"` |
| `tinyld` (normal) | 47/96 | 16/23 | **13/13** | 0/8 | Same as light |
| `tinyld/heavy` | 33/96 | 11/23 | **13/13** | 0/8 | Same as light, plus guesses `sk` on `"CV"` |
| **`eld` (`/large`)** | **9/96** | **9/23** | **13/13** | 0/8 | Returns `''` for `""`/`"123"`; **guesses a language (often confidently) for `"a"`, `"OK"`, `"Hi"`** |
| `cld3-asm` | 36/96 | 13/23 | **13/13** | 0/8 | **Never abstains.** Confidently (reliable=true) guesses a language for `""`, `"a"`, `"Hi"`, `"Java"`, `"123"` |

**`eld` is the clear best candidate on both measured axes** — lowest
false-refusal rate by a wide margin (9 vs. the next-best 33) and a perfect
13/13 catch rate on the exact class this library is being adopted to close.
It also correctly classified **all three "known hard English lines"**
(`Additional: Conversational Portuguese` and both `headers_plus_tech_only`
lines) as English with `reliable=true` — the current n-gram detector's own
documented narrowest margin, and no other candidate got all three right.

### The finding that matters most: `eld`'s 9 misses are not noise

All 9 of `eld`'s false refusals are the **same failure shape**: a line
consisting entirely of proper nouns with no other English structural text —
8 are literally the first line of a CV (the candidate's own name, e.g.
`"Priya Chandrasekaran"` → guessed Basque, `"Rajesh Thiruvananthapuram"` →
guessed Sindhi, `"Kwabena Boateng - HGV Driver"` → guessed Tagalog), and the
9th is `"Amrita Vishwa Vidyapeetham Coimbatore"` — an Indian university-name
line from `INDIAN_ENGLISH_CVS`, the exact **H-086 shape** (long
transliterated proper nouns misread as foreign morphology) that the current
engine's `ENGLISH_INSTITUTION_WORDS` exemption exists to fix. **3 of the 9
misses are from the Indian corpus specifically** — the corpus
`docs/SESSION_STATE.md` names as "a PRIMARY case, not an edge."

`isReliable()`/`is_reliable` do **not** cleanly separate these misses from
correct guesses: some misses report `reliable=true` (confidently wrong —
`"Priya Chandrasekaran"` → `eu` at reliable=true) and some report
`reliable=false`, so a confidence cutoff cannot be layered on to filter them
without also cutting correct low-confidence English verdicts elsewhere in
the corpus. This was checked, not assumed.

**Root cause, and why it recurs across every candidate, not just `eld`:**
the existing sub-floor pass (`carriesNonEnglishFunctionWords`) has a
**"silence is safe" bias** — it only fires on a positive lexicon match, so
absent evidence it says nothing, which is exactly why it misses Germanic
compounds (no function words to match) but never misfires on a name (a name
also has no function-word matches, so it's silently — correctly — passed).
Every general-purpose LID library tested has the opposite bias: asked to
classify anything, **it always returns a best guess**, because that is what
a language identifier is for. A 2–4-word string of proper nouns carries
almost no language signal by construction, so every library's "best guess"
on it is close to a coin flip — and a coin flip against ~60-190 candidate
languages lands on "not English" most of the time. This is not a defect
particular to `eld`; it is a structural mismatch between what a
general-purpose classifier is built to do (always answer) and what this
codebase's veto-only architecture currently relies on (default to silence,
only speak on positive evidence). It is also exactly the failure mode the
existing detector's own module comment already names as its "hardest case
for any character-statistics approach" — measured here to be equally true
of every trained-model candidate, not just the hand-rolled one.

**Quantified cost if wired naively.** If `eld` (or any candidate) were wired
as a straight per-line replacement for the sub-floor pass — judge every raw
line, veto the document on any non-English verdict, matching how the rest of
`findNonEnglishSegments` already works — **9 of the 23 English CVs (39%) in
this corpus would contain at least one falsely-refused line**, purely from
the name-header effect. `ADR-025`/`H-080` already measured and explicitly
rejected a **17%** document-level false-refusal cost for a different,
previously-considered heuristic as too expensive. 39% is worse. This is a
genuinely new finding this spike surfaces — the current architecture has
never had this failure mode, because the existing sub-floor lexicon's
"silence is safe" bias means a bare name line has always passed silently.

This does not mean the class cannot be closed — the 13/13 catch rate says it
can — but it means **naive integration is measured to fail**, and closing it
responsibly needs a gating decision (which granularity the library is
invoked at, and on what basis) that is out of this survey's scope
(`docs/NEXT_PHASE.md` assigns integration/measurement to Task A.3–A.5, a
different engineer, after this ADR is accepted). Whatever that gate is, it
must be an **input-side** decision about what text reaches the classifier —
matching how every other signal in this module is already gated
(`MIN_WORDS_FOR_SEGMENT_JUDGEMENT`, `MIN_LETTERS_FOR_WINDOW`) — and must not
be a semantic **output-side** correction stacked on the library's verdict
(e.g. "ignore a foreign verdict if the line looks like a name"), which is
exactly the heuristic-stacking `docs/NEXT_PHASE.md` §4 prohibits and the
pattern that produced this project's own compounding-signal →
institution-word-exemption treadmill (ADR-030 → H-086).

---

## License evaluation (ADR-016 standard)

Every LICENSE file below was opened and read on 2026-08-14, in an isolated
npm install outside the repo. Declared metadata was **not** treated as
evidence per se — see the franc note above for the one case where the
declaration had to be corroborated from source instead of a bundled file.

### Recommended candidate: `eld@2.1.0` — full resolved tree (1 package)

| Package | Declared | LICENSE file says |
| --- | --- | --- |
| `eld@2.1.0` | `Apache-2.0` | `node_modules/eld/LICENSE` — genuine Apache License, Version 2.0, January 2004, full standard text (Sections 1–9, TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION) confirmed by direct read |

**Zero transitive dependencies** (confirmed: `package.json` has no
`dependencies` key at all, and `npm ls --all` under an isolated install of
`eld@2.1.0` alone resolves to exactly one package). Apache-2.0 is already on
`PRODUCTION_ALLOWED` in `scripts/license-audit.mjs`. **No `METADATA_WAIVERS`
entry is required** — this evaluates cleanly under `isAllowedExpression`,
the same "no waiver needed" outcome ADR-026 recorded for `pdf-lib`/`docx`.

### For comparison — `cld3-asm@4.0.0`'s full resolved tree (8 packages)

| Package | Declared | LICENSE file says |
| --- | --- | --- |
| `cld3-asm@4.0.0` | `MIT` | `node_modules/cld3-asm/LICENSE` — verbatim MIT, © 2017 OJ Kwon |
| `emscripten-wasm-loader@3.0.3` | `MIT` | **No `LICENSE` file ships in the npm package** (only `CHANGELOG.md`, `README.md`, `dist/`, `package.json`, `src/`). Checked the GitHub repo (`kwonoj/emscripten-wasm-loader`, default branch `master`) directly — **no `LICENSE` file found there either**, and no license text anywhere in the README. The MIT declaration is **unverified metadata** by ADR-016's own standard ("probably MIT" is not evidence) — this is exactly the class of claim ADR-016 was written to stop waving through. `pnpm licenses list` would report this as `MIT` from `package.json` and the audit script would pass it silently, because the script's SPDX matching has no mechanism to notice a LICENSE file is absent. |
| `getroot@1.0.0` | `MIT` | `node_modules/getroot/LICENSE` — verbatim MIT, © 2017 OJ Kwon |
| `tslib@1.14.1` | `0BSD` | `node_modules/tslib/LICENSE.txt` — genuine Zero-BSD text ("Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted"), © Microsoft Corporation |
| `nanoid@2.1.11` | `MIT` | `node_modules/nanoid/LICENSE` — verbatim MIT, © 2017 Andrey Sitnik |
| `unixify@1.0.0` | `MIT` | `node_modules/unixify/LICENSE` — verbatim MIT, © 2014-2015, 2017 Jon Schlinkert |
| `normalize-path@2.1.1` | `MIT` | `node_modules/normalize-path/LICENSE` — verbatim MIT, © 2014-2017 Jon Schlinkert |
| `remove-trailing-separator@1.1.0` | `ISC` | `node_modules/remove-trailing-separator/license` — genuine ISC boilerplate text confirmed |

Every SPDX id in `cld3-asm`'s tree is individually on `PRODUCTION_ALLOWED`
(no waiver needed there either), **but one node in that tree
(`emscripten-wasm-loader`) has no LICENSE file to read at all**, and
`nanoid@2.1.11` (published 2020-01-30) carries a **high-severity** advisory
(`GHSA-2v37-7h3g-55p8`, non-secure ID generation can loop indefinitely on a
zero/negative size — `npm audit` flags it directly; `fixAvailable` is a
semver-major downgrade to `cld3-asm@1.0.1`, which is not really a fix). This
is a second, independent reason `cld3-asm` is not the recommendation, on top
of it being the weakest candidate on the false-refusal measurement (36/96)
and its 4.0.0 release being ~2.6 years stale.

### `tinyld@1.3.4` — full resolved tree (1 package), for the record

| Package | Declared | LICENSE file says |
| --- | --- | --- |
| `tinyld@1.3.4` | `MIT` | `node_modules/tinyld/license` — verbatim MIT, © 2021 Komodo |

Also zero transitive dependencies, also clean, also no waiver needed.
`tinyld/heavy` is the best-performing `tinyld` build (33/96 false refusals,
13/13 catch) but is still ~3.7x worse than `eld` on the false-refusal axis
and its own package ships 12 MB unpacked including an unused 3.5 MB browser
playground demo. Recorded here as the credible runner-up if the tech lead
weighs the newer/fresher publish date of `eld` as a risk rather than a
merit.

---

## Decision

**Approve `eld@2.1.0`, pinned to an exact version, as a production
dependency**, imported via its static `eld/large` entry point
(`import { eld } from 'eld/large'`) so no async `.load()` step is needed at
call time. It clears the license bar with zero transitive dependencies and
no waiver required, it is the only candidate that both (a) achieves a
perfect 13/13 catch rate on the Germanic sub-floor class E5 is blocked on and
(b) has by far the lowest false-refusal rate of any candidate on ordinary CV
content — including every "known hard" English line already documented in
this codebase as the existing detector's narrowest margin.

**This is a decision about the dependency, not about a specific line-by-line
integration strategy.** It does **not** by itself close H-041 or unblock E5.
`docs/NEXT_PHASE.md` assigns integration, gating design and re-measurement
to Task A.3–A.5 (a separate engineer, after this ADR is accepted), and the
spike above found a real, quantified reason that hand-off matters: a naive
per-line wiring is measured to fail (9/23 CVs, 39%, worse than the
17% `ADR-025`/`H-080` already rejected). **H-041 must not be re-classified
until that engineer re-runs this same corpus (all 96 English lines, all 13
Germanic lines, the per-CV rollup) against however `eld` is actually wired
in**, per `docs/NEXT_PHASE.md`'s own pass criteria (zero false refusals
across all 23 English CVs). This ADR's spike is evidence for choosing the
dependency; it is explicitly **not** evidence that integration is solved
(H-025: "An ADR is a decision, never evidence of implementation").

**`franc`/`franc-min`/`franc-all` and `cld3-asm` are not recommended.** All
four have a worse measured false-refusal rate than `eld`, `franc`/`franc-min`
additionally miss 3/13 Germanic cases outright (they do not fully close the
class this dependency exists to close), and `cld3-asm` carries an unverified
LICENSE claim plus a high-severity vulnerable transitive dependency on top of
being the weakest wasm/native-adjacent candidate measured.

---

## Costs, accepted

- **The false-refusal class documented above is real and is not solved by
  this ADR.** Approving `eld` trades a closed wrong-score class (pending
  Task A.3) for a new, measured false-refusal risk concentrated on
  proper-noun-only lines — most visibly candidate name headers, which appear
  in essentially every real CV, and Indian institution-name lines, which
  recur the H-086 pattern this project has already had to fix once. Naive
  integration is worse than a cost this project already rejected (H-080,
  17%). **Whoever integrates this must design and measure a gate before
  wiring it in as a document-level veto, not assume the 13/13 catch rate
  transfers unchanged.**
- **A newly-published dependency.** `eld@2.1.0` was published 2026-08-13, one
  day before this survey. The package itself is not new (created 2023-05-31,
  15 published versions, a normal beta→stable release cadence), but the
  exact pinned version has had zero time in the wild. `tinyld@1.3.4`
  (unchanged since 2024-01-12, so heavily field-tested) is the documented
  fallback if the tech lead weighs this as unacceptable — at the cost of a
  ~3.7x worse false-refusal rate.
- **`eld`'s package ships 8.7 MB unpacked** (all four size tiers, though only
  the imported `large` tier's 4.3 MB data file is actually loaded at
  runtime) — a real increase to install size and `node_modules` weight for a
  tool distributed to a non-technical recruiter (ADR-013), though this is a
  disk-footprint cost, not a runtime-network one; C2/offline behavior is
  unaffected since the n-gram data ships in the package, not fetched.
- **No language-ID library was tested for cross-`Node`-version or
  cross-architecture determinism (C4).** `eld` and `tinyld` are pure JS with
  no floating-point-sensitive scoring exposed in their public API (both
  return a discrete language code, not a float this codebase would round),
  so this is a lower-risk category than, say, embeddings — but it was not
  explicitly measured, and is flagged as unverified rather than assumed
  clean.
- **This survey did not evaluate `franc-all`'s larger language set as a
  mitigation for anything** — it was measured strictly worse than `franc` on
  false refusals (52/96 vs 47/96) for a class ADR-006 does not need (this
  product only needs English-vs-not, never which language), so its larger
  footprint buys nothing here.

---

## Reporting — files and paths

- This draft: `<scratch>/dep-analyst/ADR-031-DRAFT.md`
- Spike corpora (copied verbatim from the eval test file, with construction
  method documented in-file for the Germanic sub-floor lines):
  `<scratch>/dep-analyst/spike/corpora.mjs`
- Spike runner: `<scratch>/dep-analyst/spike/measure.mjs`
- Raw spike output (final run, includes per-CV rollup):
  `<scratch>/dep-analyst/spike/out4.txt`
- Isolated npm project used for every install-size/license/dependency-tree
  measurement: `<scratch>/dep-analyst/spike/` (`package.json`,
  `node_modules/`) — **outside the repo**, nothing here touched
  `pnpm-lock.yaml` or repo `node_modules`.

`<scratch>` =
`/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad`
