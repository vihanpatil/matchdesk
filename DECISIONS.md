# Architecture Decision Record

Append-only. Each entry states the decision, the reasoning, and what it costs.

---

## ADR-001 — Dependency versions and runtime floor

**Date:** 2026-08-12 · **Status:** Accepted

The build directive locked Fastify 4.x, React 18, TypeScript 5.x. Live registry
audit at kickoff found Fastify 5.11.3, React 19.2.8 and Tailwind 4.3.3 current.

**Decision:** take current majors — Fastify 5.11.3, React 19.2.8, Tailwind 4.3.3
— on a greenfield project with no migration debt. Fastify 4 is on the
maintenance track.

**TypeScript stays on 5.9.3, and this is forced, not chosen.** TypeScript 7.0.2
is published, but `typescript-eslint@8.67.0` declares a peer range of
`typescript >=4.8.4 <6.1.0`. TS 7 sits outside every typescript-eslint range, so
`strict-type-checked` linting — mandated by Section 3.2 — is impossible on it.
The directive's "TypeScript 5.x" lock was correct.

**Node floor raised from the directive's ">=20 LTS" to >=24.15.0.** Two forcing
constraints: `better-sqlite3@13.0.3` declares `engines.node >=22`, and
pnpm 11.21.0 requires `^22.22.2 || ^24.15.0 || >=26`. Node 24 LTS ("Krypton",
maintenance to ~April 2028) was chosen over 22 LTS (April 2027) because C1
promises the recruiter can still run this in five years. Pinned via `.nvmrc`;
installed with nvm so the machine's Homebrew Node is untouched.

**Cost:** Tailwind 4's CSS-first configuration differs substantially from v3, so
v3 examples will not copy-paste. Accepted — written once, at the start.

---

## ADR-002 — Embedding runtime and model pinning

**Date:** 2026-08-12 · **Status:** Accepted

Section 3.2 specified `@xenova/transformers`. Registry audit found it frozen at
v2.17.2, last published **2024-05-29** — 27 months stale. It carries no npm
deprecation notice, so it fails silently rather than warning. The maintained
successor, from the same author, is `@huggingface/transformers@4.2.0`
(2026-04-22), same Apache-2.0 license.

**Decision:** use `@huggingface/transformers`. Section 3.2 forbids silent
substitution, so this was raised and approved before adoption.

**Model pinned (Section 3.3):**

| Field    | Value                                          |
| -------- | ---------------------------------------------- |
| Model    | `Xenova/all-MiniLM-L6-v2`                      |
| Revision | `751bff37182d3f1213fa05d7196b954e230abad9`     |
| License  | Apache-2.0                                     |
| Weights  | fp32 (`onnx/model.onnx`), **90,387,606 bytes** |

The directive's "~25MB" figure describes the int8 quantized file. Section 3.2
also specifies "quantized off", and the two cannot both hold. Quantization-off
was treated as authoritative; the size figure is corrected here.

Revision is persisted on every embedding and every match row. A revision change
invalidates all cached scores and must warn the recruiter that re-scoring is
required.

---

## ADR-003 — Two-tier license audit

**Date:** 2026-08-12 · **Status:** Accepted

Section 3.2 mandates `@axe-core/playwright`; Section 3.4 mandates a CI gate that
fails on any license outside MIT/Apache-2.0/BSD/ISC. axe-core is **MPL-2.0**, so
as written Phase 0's license gate fails on a Phase 0 dependency. This is a
contradiction internal to the directive, not an engineering problem.

**Decision:** split the audit by scope.

- **Production dependencies** — strict allowlist. These licenses travel with the
  artifact the recruiter runs.
- **Development dependencies** — the same allowlist plus MPL-2.0. MPL is
  file-level copyleft; we neither modify nor redistribute axe-core's source, so
  no obligation attaches to a build-time-only dependency.

Unknown or unparseable licenses fail in both scopes. Implemented in
`scripts/license-audit.mjs`.

---

## ADR-004 — Team composition

**Date:** 2026-08-12 · **Status:** Accepted

Section 0.4 forbids working on two phases simultaneously, so a wide parallel
fleet would add coordination risk without shortening the critical path.

**Decision:** Opus tech lead (owns architecture, gates, both logs, and all
communication) + 2 Sonnet engineers (core/engine; platform/UI — separable
because Phases 1–6 are backend and 7–8 are frontend) + **1 Opus adversarial
verifier** that runs after every phase gate and attempts to falsify the gate
claim rather than confirm it.

The verifier is Opus rather than Sonnet deliberately: detecting a hollow test, a
quietly-updated golden file or a broken invariant is harder than writing the
code that introduced it.

---

## ADR-005 — When a scoring dimension is N/A

**Date:** 2026-08-12 · **Status:** Accepted, **CLAIM NARROWED — see ADR-018**

> **The monotonicity guarantee below holds only for the weighted sum.** Slice
> verification demonstrated it is **false end-to-end**: adding an Education
> section to a CV cost a candidate 53 points, because extraction silently
> dropped their entire employment history (H-028 D1). Monotonicity of the
> arithmetic does not imply monotonicity of the product.

Section 6.4 renormalizes weights when a dimension is N/A. Section 9.3 requires
that adding a matched requirement never lowers a score. **These conflict if N/A
is determined candidate-side:** a candidate with no education has that dimension
dropped and its weight redistributed across dimensions they score well on;
adding one marginal certification activates education at a low subscore and the
total _falls_. The tool would visibly punish a candidate for holding more
credentials — indefensible to a hiring manager, which is the tool's purpose.

**Decision:** a dimension is N/A **only when the job states no requirement for
it.** The active dimension set is therefore fixed per job and identical for
every candidate under it, so no candidate attribute can shift weights.
Monotonicity becomes a provable invariant, and candidates stay directly
comparable within a role.

---

## ADR-006 — Non-English CVs are not scored

**Date:** 2026-08-12 · **Status:** Accepted, **NOT IMPLEMENTED — see ADR-018**

> **This decision is currently unenforced.** `packages/core` has no notion of
> language and nothing in `apps/server` reads the stored `language` column. The
> detection heuristic also does not separate the classes — it scores a French CV
> as more English than a real English CV (H-028 D6). Until both are fixed, the
> C7 guarantee this ADR provides does not exist.

`all-MiniLM-L6-v2` is English-trained; the skills taxonomy, date parsing and
section-header detection are English. Section 9.2 nonetheless requires a
non-English CV fixture. Producing a score would mean emitting a confident,
meaningless number — precisely the C7 failure the directive exists to prevent.

**Decision:** detect language at ingest. Non-English documents route to the
"Needs attention" tray as _"Language not supported — English only"_ and are
**never scored**. The fixture tests the refusal path, not a capability we do not
have. A multilingual model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`,
verified available) was rejected: it measurably weakens English semantic
quality, which is the overwhelmingly dominant case, and would not fix the
English-only rule-based extraction regardless.

Stated plainly in `docs/LIMITATIONS.md`.

---

## ADR-007 — Protected-characteristic proxies and the eligibility partition

**Date:** 2026-08-12 · **Status:** Accepted, **PARTIALLY SUPERSEDED by ADR-017**

> **Read ADR-017 before implementing anything from this entry.** The clause
> below stating that must-have requirements never enter the weighted sum is
> **no longer in force** — they now both score and partition. Everything else
> here, in particular the protected-characteristic proxy dispositions, remains
> fully binding.

Section 10.4 requires flagging any scoring signal that could proxy for a
protected characteristic. Three were identified:

| Signal             | Proxies for                           | Disposition                                                |
| ------------------ | ------------------------------------- | ---------------------------------------------------------- |
| Work authorization | National origin, immigration status   | Contributes **zero** to any score                          |
| Institution name   | National origin, socioeconomic status | Never scored; education scores degree level and field only |
| Graduation year    | Age                                   | **Never extracted at all**                                 |

**Decision:** none of the three enters the weighted sum. Instead, a job's hard
requirements are evaluated as a **separate eligibility predicate that partitions
results rather than adjusting them.** The recruiter sees an _Eligible_ group
ranked by score and a _Does not meet stated requirements_ group ranked by the
same score — collapsed by default, never hidden, with the specific unmet
requirement named per candidate. This unifies with the Section 6.3 gate
mechanism: one predicate, one concept.

Two properties follow structurally rather than by weight tuning:

1. An ineligible candidate can never outrank an eligible one.
2. Section 9.3 monotonicity is untouched, because nothing here enters the
   weighted sum.

Both become property-test invariants in Phase 5.

**Flagged honestly, per Section 10.4:** partitioning on work authorization
retains the same disparate-impact character as scoring on it. What changes is
that the effect is _visible, named per candidate, and auditable_ rather than
diffused into a number — better for Sections 10.3 and 10.5, but **not compliance
by construction.** Removing work authorization from the eligibility predicate
entirely, leaving it as a display-only fact, is a one-line configuration change
the design supports. Also recorded in `docs/LIMITATIONS.md`.

---

## ADR-008 — Original files live outside the database

**Date:** 2026-08-12 · **Status:** Accepted

Section 4 permits storing "original file bytes or path"; Section 11 budgets the
whole database under 500 MB for 200 CVs + 200 jobs. Scanned PDFs run 5–20 MB
each, so originals alone exceed the budget before embeddings are counted.

**Decision:** originals are stored in a sidecar `files/` directory beside the
SQLite file, content-addressed by SHA-256; the database holds path + hash.
Deduplication (Section 4) falls out of content-addressed naming for free.

**Cost, stated plainly:** C6's "backed up by copying one file" becomes "copying
one folder". Mitigated in Phase 11 by a tested backup/restore procedure.

---

## ADR-009 — Fixed rounding strategy

**Date:** 2026-08-12 · **Status:** Accepted

Section 6.4 requires a fixed float rounding strategy, documented. Section 6.6
requires determinism.

**Decision:** one function, `roundHalfUp(value, decimals)` in
`packages/core/src/numeric/round.ts`, is the only rounding permitted anywhere in
the engine. Ties round toward positive infinity. It re-reads the scaled value at
15 significant digits before breaking the tie, because binary floating point
stores many decimals slightly low (`1.005 * 100 === 100.49999999999999`, which
naively rounds the wrong way).

`quantize(v)` collapses to 6 dp and is applied to embedding components, cosine
similarities and dimension subscores before combination. This is the C-5
mitigation: since a final score is `round(raw * 100)`, unmitigated drift of
~1e-7 can flip a boundary value. **It reduces the risk; it does not make
cross-architecture reproduction a guarantee.** See `HONESTY_LOG.md`.

---

## ADR-010 — Phase 1 gate reworded

**Date:** 2026-08-12 · **Status:** Accepted

Section 12's Phase 1 gate demands "migration up/down verified", but Section 4
mandates forward-only migrations. A down-migration that does not exist cannot be
verified.

**Decision:** Section 4 stands (forward-only). The Phase 1 gate becomes: migrate
empty → head against a real SQLite file, restore-from-backup verified, and
proof that `UPDATE` on `audit_log` fails.

---

## ADR-011 — Thin vertical slice before full rigour

**Date:** 2026-08-12 · **Status:** Accepted · **Deviates from Section 12**

Section 12 mandates strict phase order. Phases 1–7 do deliver the core loop, but
they front-load a 30-CV fixture corpus, OCR, a LinkedIn parser and property
tests before anything is clickable.

**Decision:** build the narrowest end-to-end path first — upload one PDF/DOCX job
and CV, persist to SQLite, rule-based extraction, score, show evidence — then
loop back and bring each stage up to directive standard.

**Rationale:** the recruiter's real workflow is the thing most likely to be
misunderstood, and it is cheaper to be wrong about it before 30 fixtures are
built around the wrong assumptions than after.

**Cost, stated plainly:** work will be revisited, and for a period the codebase
will not meet Section 9's coverage and fixture requirements. That is a temporary
state, not a reduction in the target. Every gate deferred this way is tracked in
`HONESTY_LOG.md` until met.

---

## ADR-012 — Recruiter data lives in `~/.matchdesk/`

**Date:** 2026-08-12 · **Status:** Accepted

The repository is public (ADR-014), so anything inside the working tree is one
mistaken `git add -f` away from publication, and a re-clone or fresh checkout
would silently start with an empty database.

**Decision:** the SQLite file and the content-addressed `files/` directory
(ADR-008) live in `~/.matchdesk/`, outside the repository entirely. Survives
re-cloning, deleting the project folder, and pulling updates. Backup is "copy
`~/.matchdesk`".

**Cost:** less discoverable for a non-technical user than a folder inside the
project. Mitigated by naming the exact path in the UI's settings screen and in
the README.

---

## ADR-013 — Distribution: documented setup plus a launcher script

**Date:** 2026-08-12 · **Status:** Accepted

The goal is that any recruiter can use this, but running it currently requires
Node 24, pnpm, and a terminal.

**Decision:** Section 13's one-command start, plus a double-clickable launcher
(`.command` on macOS, `.bat` on Windows) that starts the server and opens the
browser. The README states Node as a prerequisite honestly rather than implying
zero-install.

Packaging as a desktop application (Tauri/Electron) is explicitly **out of scope
for now** and revisited after Phase 11 — it carries its own build, signing and
update concerns.

---

## ADR-014 — Public repository

**Date:** 2026-08-12 · **Status:** Accepted

**Decision:** `github.com/vihanpatil/matchdesk` is public, so the project can be
shown as portfolio work and used by other recruiters.

**This does not weaken C3.** Candidate data never enters the repository: the
database and uploaded files live in `~/.matchdesk/` (ADR-012), and `.gitignore`
excludes `data/`, `files/`, `*.db` and `.models/`. Every fixture is synthetic by
Section 9.2 mandate.

**Standing constraint this creates:** no real CV, no real job description, and
no recruiter-identifying content may ever be committed. Any future contributor
convenience that would place candidate data inside the working tree is
prohibited.

---

## ADR-015 — Adversarial verification runs at phase gates only

**Date:** 2026-08-12 · **Status:** Accepted

The Opus verifier falsified the Phase 0 gate three times, including two
regressions introduced by the lead — one of which repeated a trap already
recorded in `HONESTY_LOG.md`. It also exhausted the account's monthly spend
limit mid-run.

**Decision:** keep the Opus verifier, but invoke it once per completed phase
rather than per iteration.

**Consequence to track:** verification cannot run while the spend limit is
reached. Any phase completed during such a period is **not** independently
verified, and that must be stated in `HONESTY_LOG.md` at the time rather than
assumed to be fine.

---

## ADR-016 — SPDX evaluation corrected; narrow per-package metadata waivers

**Date:** 2026-08-12 · **Status:** Accepted

Adding `mammoth` (the Section 3.2-locked DOCX library) failed the production
license gate on three transitive dependencies. Investigation found **two were
bugs in our own audit script, not licensing problems**:

1. **`jszip@3.10.1` — `(MIT OR GPL-3.0-or-later)`.** `atomsOf()` collapsed `OR`
   and `AND` and required every atom to be allowed. Its own comment called this
   "only ever stricter"; that was wrong. It is not stricter, it is **incorrect**
   — `OR` denotes a genuine choice, and jszip's LICENSE says so explicitly:
   "At your choice you may use it under the MIT license _or_ the GPLv3."
   Replaced with `isAllowedExpression()`, which treats the expression as a
   disjunction of conjunctions: any acceptable branch passes, every term within
   a branch must pass. Unparseable nesting returns false rather than guessing.
2. **`pako@1.0.11` — `(MIT AND Zlib)`.** `Zlib` is OSI-approved and permissive,
   in the same family as MIT/BSD/ISC. Its omission from the allowlist was an
   oversight, not a policy position. Added.

3. **`duck@0.1.12` — bare `"BSD"`.** Not a valid SPDX identifier, and the
   ambiguity is material: BSD-4-Clause carries an advertising obligation that
   BSD-2-Clause does not. The gate correctly refused to guess.

**Decision:** a `METADATA_WAIVERS` map holds per-package waivers, **pinned to an
exact version**, each carrying the evidence from reading the actual LICENSE
file. `duck@0.1.12` is waived as BSD-2-Clause on this evidence: exactly two
clauses, no endorsement clause, no advertising clause.

A new version of a waived package fails again and must be re-inspected —
verified by negative control. Waivers print on every run, because a silent
waiver is indistinguishable from a hole in the gate.

**Rejected:** adding bare `"BSD"` to the allowlist. It would wave through a
license nobody has read, which is precisely what Section 3.4 exists to prevent.

**Also approved:** `@types/better-sqlite3` (MIT, devDependency, type-only).
`better-sqlite3` ships no bundled type declarations, so without it `tsc` raises
`TS7016` on every import and the Section 0.2.3 no-`any` rule becomes
unsatisfiable.

---

## ADR-017 — Must-haves both score and partition (amends ADR-007)

**Date:** 2026-08-12 · **Status:** Accepted · **Amends ADR-007**

ADR-007 removed must-have requirements from the weighted sum entirely, so that
eligibility could partition results without any risk of weight-tuning. Correct
in ordering, but a live probe showed the consequence:

```
eligible  : weak=0        (meets the hard requirement, no preferred matches)
ineligible: strong=100    (perfect on preferred, fails the hard requirement)
```

The score reflected preferred requirements only. A recruiter would see 0% beside
the one candidate they are allowed to hire — and Section 8.1 is explicit that a
recruiter nine hours into a day must not be able to misread the screen.

**Decision:** must-have requirements now do both jobs. They contribute to the
weighted sum exactly like any other requirement, **and** they form the
eligibility predicate that partitions results.

**What this does not change:** the partition is still structural. Eligible and
ineligible are separate groups and an ineligible candidate can never appear
above an eligible one, regardless of score. That guarantee never depended on
excluding must-haves from the sum — it comes from the grouping.

**What this does not weaken:** ADR-007's proxy protections are untouched. Work
authorization still contributes zero to any score, institution is still never
scored, and graduation year is still never extracted. Those are separate from
whether a _skill_ requirement marked must-have is allowed to count.

Monotonicity (Section 9.3) still holds, because the active dimension set remains
job-side only (ADR-005).

---

## ADR-018 — Extraction hardening precedes the UI (corrects ADR-005, ADR-006, ADR-011)

**Date:** 2026-08-12 · **Status:** Accepted

Adversarial verification of the thin slice found seven defect classes, each
producing a wrong number for a real candidate, with a fully green suite
(H-028). The verifier's summary is adopted verbatim as the finding:

> The slice proves the _pipeline_ end-to-end but not the _extraction_, and the
> extraction is the entire product.

**Decision 1 — ADR-005's monotonicity claim is narrowed.** It is proven for
weight renormalisation and **false end-to-end**. Adding an Education section
cost a candidate 53 points because extraction dropped their employment history.
The invariant must be re-stated and re-tested at the level a candidate actually
experiences: _text in → score out_, not _attributes in → score out_.

**Decision 2 — ADR-006 is marked unimplemented.** Language detection neither
separates the classes nor has any enforcement point. C7's "never score a
document you could not read" is not currently true for non-English documents.

**Decision 3 — ADR-011's sequencing is corrected.** The thin slice was meant to
front-load feedback and defer rigour. It succeeded at proving the architecture
and failed to reveal that the extraction layer was unsound, because the deferred
item — the Section 9.2 fixture corpus — is precisely the mechanism that would
have caught D1, D2, D3, D4 and D6.

**The fixture corpus is therefore pulled forward, ahead of `apps/web`.** No UI
work begins until extraction is hardened against a representative corpus. A
clickable demo over wrong numbers is worse than no demo: it invites trust the
tool has not earned.

**Decision 4 — gates must be written adversarially.** ADR-010's audit-log gate
said "proof that UPDATE on `audit_log` fails". That was proven, and `INSERT OR
REPLACE` still rewrites history (H-028 D7), because SQLite's REPLACE does not
fire BEFORE DELETE triggers without `PRAGMA recursive_triggers`. A gate phrased
as "the statement form I thought of fails" is not a gate. Gates are re-worded to
state the _property_ — "no statement of any form may alter or remove a committed
audit row" — and tested across statement forms.

**Cost:** the clickable app is further away than ADR-011 implied. Accepted. The
alternative is shipping a tool that tells a recruiter a candidate named Rémi
knows R.

---

## ADR-019 — Metamorphic relations are the primary correctness net

**Date:** 2026-08-12 · **Status:** Accepted

Five separate defects reached a fully green suite (H-030). Looking at what
actually caught each is decisive:

| Entry | Caught by                         | Missed by               |
| ----- | --------------------------------- | ----------------------- |
| H-004 | reading the coverage JSON by hand | 100% coverage           |
| H-013 | mutation testing                  | 100% branch coverage    |
| H-022 | a spot-check with a realistic CV  | 93% branch coverage     |
| H-025 | running the system                | the entire green suite  |
| H-028 | realistic and adversarial inputs  | 369 tests, 94% branches |

Not one was caught by coverage, and that is definitional rather than
accidental: coverage answers "did this line run?", while the failure is "was
the input representative?" The root cause is that **the person writing the test
inputs is the person who wrote the code**, so the tests inherit the author's
blind spot. More tests written the same way buy more of the same blind spot at
higher cost.

**The observation that drives this decision:** every defect in H-028 is a
violated _relation_, not a wrong constant.

| Defect | Relation violated                                       |
| ------ | ------------------------------------------------------- |
| D1     | renaming a section header must not change the score     |
| D2     | text containing "Ruby on Rails" still contains "Ruby"   |
| D3     | a candidate's **name** must not affect their **skills** |
| D4     | a job title must not produce a degree                   |
| D5     | dates inside an education section are not employment    |

**None of these requires a hand-authored expected value.** A metamorphic
relation compares two runs and asserts how they relate — `score(cv)` must equal
`score(cv with the header renamed)` — without anyone computing either score.
That is what makes it catch failures nobody imagined, which is precisely the
recurring failure mode.

**Decision:** metamorphic relations over generated CVs are the primary
correctness net for extraction, in
`packages/core/src/metamorphic/`, generated by
`packages/core/src/testkit/cv.ts`. They run in `pnpm test`, so a violation
surfaces at commit time rather than at a gate review hours later — which is the
"catch it earlier" requirement.

**Rules for relations, learned while writing them:**

1. **Never weaken a relation to make it pass.** If a relation is wrong, correct
   it and say why in the same change.
2. **A relation that needs a human to adjudicate each case is not a relation.**
   The first R6 asserted that a whitespace-delimited term inside a longer term
   must still be extracted — correct for `Ruby on Rails → ruby`, but it then
   demanded `c` out of `"C Sharp"`, which is false, since C# is a different
   language from C. No lexical rule separates those. Split into a mechanical
   relation (non-destruction) plus a short **curated, reviewable** list where
   the implication is a stated human judgement.
3. **Compare summaries, not spans.** Spans legitimately move when text changes;
   a relation over them fails for uninteresting reasons.

**Evidence it works:** run against the unfixed code, 7 of 11 relations failed,
and R3 rediscovered the `Rémi Dubois → skill r` defect **in two generated cases**
— a defect that had taken an Opus verifier a long hostile probing session to
find.

**The fixture corpus is a supplement, not a replacement** (ADR-018 pulled it
forward). Relations prove self-consistency between runs; they cannot prove any
single output is _correct_. Golden fixtures catch a regression where the whole
system shifts consistently in the wrong direction. Both are needed; relations
are cheaper per defect found.

---

## ADR-020 — Mutation testing runs in CI

**Date:** 2026-08-12 · **Status:** Accepted

The adversarial verifier ran mutation testing by hand three times and found real
defects every time. Most recently, **22 of 46 mutants survived** — meaning the
entire seniority ladder (0/2/5/8/12) can be moved arbitrarily with a green suite
(H-029), and `hasCertification` can drop its `kind` check so that a **skill**
named `python` satisfies a required _certification_.

Mutation testing is the only automated check that measures whether tests are
_real_, rather than whether lines ran. We were already doing it manually;
automating a manual practice that keeps finding bugs is the obvious move.

**Decision:** `@stryker-mutator/core` 9.6.1 with the Vitest runner (Apache-2.0,
maintained, `vitest >=2.0.0` — verified against the live registry, not
recalled), scoped to `packages/core`, with a mutation-score threshold.

**The threshold is not 100%.** Equivalent mutants exist and are provably
uncatchable — the verifier proved three by construction. Chasing them is waste
and creates pressure to write meaningless tests. The gate is set below the
achievable ceiling so that a _drop_ is the signal, not an absolute number.

**Scoped to `packages/core` only,** because that is where the scoring logic
lives, where the ≥90% coverage bar applies, and where a surviving mutant means a
wrong score for a real person.

---

## ADR-021 — V1 product charter supersedes unconfirmed legacy constraints

**Date:** 2026-08-12 · **Status:** Accepted

The original build directive and ADRs 001–020 record the project history and
many still-binding safety decisions, but they do not describe the product the
owner chose after reviewing the working repository. Treating unstated legacy
assumptions as current product commitments would make future work look decided
when it is not.

**Decision:** `docs/PRODUCT_DECISIONS.md` is the authoritative product-decision
record for MatchDesk v1. It records the agreed individual-recruiter workflow,
privacy boundary, English-only document policy, deterministic evidence-based
matching, recruiter review of requirements, 200 × 200 local matrix, result
presentation, correction authority, lifecycle, delivery target, and required
quality standard.

**Amendment to the historical directive:** local document sovereignty remains
mandatory. Deterministic scoring, explicit refusal of unsupported/uncertain
documents, evidence-backed explanations, and proxy exclusions are also current
v1 choices. "Free forever" and "offline after first run" are _not_ accepted v1
release promises and must not be claimed or implicitly relied on until a later
decision explicitly restores them.

**Cost:** product decisions now live in a dedicated compact document alongside
the append-only technical ADRs. Accepted: it makes the source of truth usable
without rewriting or erasing the history that explains existing code.

---

## ADR-022 — A partly-English document is refused, not scored on its English part

**Date:** 2026-08-12 · **Status:** Accepted

`detectLanguageHeuristic` judges a document as one blob, so a code-switched CV
is classified by whichever language's statistics dominate. Measured on the
shipped detector: a document with **50% French sentences still classified
English**, and a single French paragraph appended to any of ten held-out
English CVs left the aggregate verdict unchanged.

`docs/PRODUCT_DECISIONS.md` says non-English and uncertain documents go to
**Needs attention** and are never scored; C7 says never score a document you
could not fully read. A half-French CV scored on its English half violates
both — the recruiter gets a confident number computed over text the extractor
silently skipped.

**Rejected: a confidence threshold.** The obvious fix is refusing when English
wins only narrowly. The measured margins make it impossible: relative margin
for `headers_plus_tech_only` — a legitimate English CV the eval corpus requires
to pass — is **0.0016**, while the code-switched document sits at **0.0063**,
four times wider. Any cut catching code-switching rejects a real English CV
first. The classes are not separable on that axis, so no threshold exists.

**Decision:** judge each segment separately and use the result as a **veto**.
`findNonEnglishSegments` splits on line and sentence boundaries, judges only
segments of ≥15 words, and reports any that are not English with source spans.
`extractText` runs it **only after** the whole-document verdict is already
English, and refuses with `mixed_language_content` if it fires.

Veto-only is the point: this layer can add refusals but can never turn a
non-English document into an English one, so the eval corpus's zero-false-
positive property is preserved **by construction**, not by re-measurement.

**The 15-word floor is measured, not chosen.** A held-out corpus of ten English
CVs spanning nursing, teaching, accountancy, catering, trades, logistics,
science, law, admin and haulage — deliberately outside the software domain both
the reference profiles and the original eval set are drawn from:

| Floor | False alarms on 10 held-out English CVs | Catches mixing |
| ----- | --------------------------------------- | -------------- |
| 8w    | 3 of 8 (in-corpus)                      | yes            |
| 10w   | 1 of 10                                 | yes            |
| 12w   | 0                                       | yes            |
| 15w   | **0**                                   | **yes**        |
| 18w   | 0                                       | yes            |
| 20w   | 0                                       | **no**         |

15 sits mid-window rather than on an edge. The sweep is asserted in
`languageDetection.eval.test.ts`, not merely described here.

**Cost, accepted:** the veto abstains on terse CVs — ~~five~~ **four** of the
ten held-out documents have no segment long enough to judge — so a **terse
bilingual CV still passes**. This narrows the C7 gap; it does not close it
(H-041). A document with a legitimate short foreign-language quotation may also
be refused; a false refusal costs the recruiter one manual review, while a
false acceptance costs a candidate a wrong score, and that asymmetry is the
whole argument for erring here.

**Corrected 2026-08-13 (H-072):** "five" was wrong — the eval asserts **four**,
by name, and has since paragraph granularity was added. **Corrected the same
day, and more seriously (ADR-027):** "a terse bilingual CV still passes"
understates this cost by a wide margin. The veto is silent on **any** document
whose lines fall below 15 words, which is most real CVs, terse or not. The
finding is classified **wrong-score** and it blocks the gate.

---

## ADR-023 — "Extraction hardened" gets a definition, and the slice gets connected

**Date:** 2026-08-12 · **Status:** Accepted

ADR-018 says no UI work begins "until extraction is hardened against a
representative corpus." **Hardened was never defined.** Every adversarial round
finds more defects — that is what adversarial rounds are for — so as written
the gate has no exit and the project can harden indefinitely. Measured on this
session alone: six H-028 defects fixed, then four more found (H-042, H-043,
H-044), with more certainly available.

A second problem, found while re-assessing scope. ADR-018 records the
verifier's summary that "the slice proves the _pipeline_ end-to-end but not the
_extraction_." **The first half is not true.** `apps/server` declares
`@matchdesk/core` as a dependency and has never imported it. Nothing in
`apps/` calls `scoreCandidate`. There is no HTTP server, no entry point and no
launcher. What was proven end-to-end was `packages/core` in isolation and
`apps/server` in isolation — never a document becoming a score.

ADR-018's own Decision 1 demands the invariant be tested at "the level a
candidate actually experiences: _text in → score out_". That level did not
exist to test.

### Decision 1 — exit criteria for extraction hardening

Hardening is complete when all of the following hold, and none of them is a
matter of judgement:

| ID  | Criterion                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| E1  | **Two consecutive** adversarial verification rounds produce no new WRONG-SCORE defect class                         |
| E2  | Every wrong-score defect ever found is pinned by a metamorphic or property test, not only an example test           |
| E3  | The Section 9.2 fixture corpus exists and passes: at least one fixture per known defect class, plus clean baselines |
| E4  | Mutation ratchet ≥ 75 on `packages/core`, with no extraction or scoring module below 60                             |
| E5  | Zero open HONESTY_LOG entries classified **wrong-score** (see the classification below)                             |

**The classification that makes this terminate.** Every open finding is exactly
one of:

- **wrong-score** — the tool reports a number that is wrong, or fabricates
  evidence for it. Invisible characters inventing skill `r`; "as" yielding an
  associate degree; a half-French CV scored on its English half. **These block.**
- **false-refusal** — the tool declines to score something it could have read.
  The terse-CV blind spot; a foreign-language quotation triggering the veto.
  **These do not block:** the recruiter sees the refusal and the document in
  front of them, so the failure is visible and recoverable.
- **coverage-gap** — a real-world input the tool does not yet understand. UK
  vocational qualifications, non-English degree names, `FIELD_VOCAB` being 14
  US-skewed entries. **These do not block**, and are properly product scope
  rather than soundness.

Only the first class can harm a candidate silently, and only the first class
gates the UI. Without this split, every gap blocks forever and E1 never fires.

### Decision 2 — the slice is connected before further hardening

The next unit of work is `packages/core` and `apps/server` actually meeting:
document bytes → extracted text → stored candidate → extracted attributes →
score → persisted match. No UI, no HTTP server, no launcher — a callable
pipeline plus a runnable script, which is the smallest thing that makes "text
in → score out" testable at all.

**Why before more hardening, not after.** Three risks are currently unmeasured
and unmeasurable, and every additional extraction fix is stacked on top of
them:

- **H-020 goes live on the first import.** `@matchdesk/core` resolves through
  `main`/`exports` to `./dist/index.js`, and a failing compile leaves the
  previous `dist` in place. Until something imports it, that is theoretical.
- **H-008's matrix budget has never been measured.** 200 × 200 is 40,000 score
  computations; Section 11 budgets the matrix at < 5 s from cache and says
  nothing about the first fill. If the real number is minutes, that is an
  architectural finding, and it is cheaper to learn now than after the UI is
  built against the assumption.
- **ADR-018 Decision 1's restated invariant** — monotonicity at text-in →
  score-out — cannot be tested until the two halves are connected.

**Cost, accepted:** this is product code written before hardening finishes,
which is precisely what ADR-018 pushed back. The distinction is that this is
not UI. It shows nothing to a recruiter and invites no trust; it exists to make
the existing rigour reach a level it currently cannot see, and to convert three
unmeasured risks into numbers.

---

## ADR-024 — Derived attributes are never persisted (closes H-052)

**Date:** 2026-08-13 · **Status:** Accepted

Extraction is a function of TWO inputs — `extractAttributes(rawText,
referenceDate)` — and `candidate_attributes` persisted only the OUTPUT.
`rawText` is content-addressed and cannot drift. `referenceDate` was a free
per-call parameter and did. Measured:

```
ingest at referenceDate 2026-01  ->  stored years_experience = 7
score  at referenceDate 2040-01  ->  scored on years_experience = 21
stored rows still said 7
```

The recruiter would be shown evidence reading 7 years beside a score computed
from 21, in a product whose stated principle is that every number traces to
highlighted evidence in the source. Not a re-upload edge case: it happens to
every stored candidate with a current role, purely through time passing.

**Decision: stop persisting derived attributes.** `candidate_attributes` is
dropped (migration 0003). `rawText` plus `engineVersion` plus `referenceDate`
fully determine them; extraction is pure and costs 0.76 ms/document (measured,
`scripts/measure-matrix.mjs`), so evidence is derived at the moment it is
needed and cannot disagree with the number it justifies.

**Why this over stamping provenance on the rows and refreshing them.** Both fix
the defect. Stamping keeps a durable evidence store but leaves TWO
representations that agree only because a check forces them to — and this
project's entire history is defects that survived because a check was absent,
vacuous, or removed (H-004, H-013, H-028, H-051). Deletion makes the
divergence impossible to express rather than merely detectable. **The cost is
real and is accepted below.**

**What replaces the table: reproducibility.** A score is only explainable if
you can re-derive exactly what produced it, so `matches` gains
`reference_date` alongside the `engine_version` it already carried. Every
stored score now names all three of its inputs, and
`pipeline.test.ts` asserts that re-deriving from stored state alone reproduces
the stored number exactly. Provenance moved to where the number lives instead
of sitting on a copy of the evidence.

A `NULL` `reference_date` means the score predates this decision and is **not
reproducible**. Callers must surface that rather than assume a default.

### Binding constraint on the suppression feature

`docs/PRODUCT_DECISIONS.md` commits v1 to: _"A recruiter may suppress a bad
extracted candidate attribute with a reason. The suppression is local,
auditable, and triggers a rescore."_ That feature was the strongest argument
for keeping the table, because a suppression needs something stable to point
at. It is not built yet, so this ADR fixes its design now rather than leaving
the next implementer to invent a fragile one:

1. **A suppression references a CONTENT KEY, not a row id** — the tuple
   `(candidateId, attributeKind, normalizedValue)`. Deliberately **excludes the
   evidence span**: spans move whenever extraction improves, and a suppression
   keyed on a span would silently stop applying after an engine change,
   letting a bad attribute quietly return and inflate a score. That is the
   wrong-score failure this project keeps finding, and it must not be designed
   in.
2. **An orphaned suppression is surfaced, never silently dropped.** If a
   suppressed attribute no longer appears in the derived set, the suppression
   has no target. The recruiter must be shown that it no longer matches
   anything — silence would mean an intervention they made simply stopped
   applying without their knowledge.
3. **Suppressions are stored and audited; only derived attributes are not.**
   Nothing in this ADR argues against persisting a recruiter's DECISIONS. It
   argues against persisting a second copy of something the engine can
   recompute. The distinction is authorship: the recruiter's judgement is
   input, the extractor's output is derivable.

**Costs, accepted and stated:**

- **The database is no longer a complete record.** Rendering a candidate's
  evidence requires running the engine. Acceptable for a local tool where the
  engine is always present, and 0.76 ms/document is not a budget concern.
- **No history.** "What did the recruiter see in August" is not answerable
  from stored state once the engine changes. It was not answerable before
  either — refreshing rows in place would have overwritten the old values just
  the same — so this is a limitation being made explicit, not one introduced.
  Reconstructing a past view would need versioned engine outputs, which is a
  separate decision nobody has taken.

---

## ADR-025 — What happens if E1 never fires

**Date:** 2026-08-13 · **Status:** Accepted

ADR-023 gave "extraction hardened" five measurable exit criteria. E1 requires
**two consecutive** adversarial rounds with no new wrong-score defect class, and
any wrong-score finding resets the counter to zero.

**The counter is at zero and has never been higher.** Every ADR-015 round run so
far has found wrong-score defects; the 2026-08-13 round found five. The
mechanism that makes E1 a real gate — a reset on any finding — is also the
mechanism by which it can fail to terminate. ADR-023 fixed ADR-018's "harden
indefinitely" problem by making the criteria measurable. It did not remove the
possibility that a measurable criterion is never met.

This is the only E-criterion whose completion is not under our control. E3 is
work; E1 is a result.

**The decision is made now, while the gate is not blocking anything, because
the moment it blocks is the worst possible moment to decide it.** This project's
recorded history is of checks that were absent, vacuous, or removed (H-004,
H-013, H-028, H-051). A bar re-litigated by someone who is stuck and frustrated
is a bar that gets lowered, and the reasoning will read as sound at the time.

### Decision

**If two further adversarial rounds each produce at least one wrong-score
finding, a re-examination of E1 becomes mandatory before a third round is
commissioned.**

Mandatory means it must happen and its outcome must be written down. It does
**not** mean the bar is lowered. The permitted outcomes are exactly:

1. **The bar is right and the work continues.** The rounds are finding real
   defects in a system that is genuinely not ready. Recorded, and rounds resume.
2. **The bar is right but the rounds are miscalibrated.** If findings are
   clustering in one area, or successive verifiers are re-finding variants of
   one root cause, the fault is in the probe design rather than the threshold.
   Recorded, round design changed, counter continues unaffected.
3. **The bar is wrong and is changed.** Only via a new ADR that states the new
   criterion, what evidence changed the judgement, and **which specific residual
   risk to a real candidate is being accepted.** A change recorded without
   naming that risk does not satisfy this ADR.

**What is explicitly not permitted:** letting the counter quietly continue past
the trigger without the re-examination happening; reclassifying a wrong-score
finding as false-refusal or coverage-gap to protect the counter; or relaxing E1
inside a commit whose stated purpose is something else.

### The trigger is a prompt, not a verdict

Two failing rounds is not evidence that the bar is wrong. It is the point at
which continuing without asking stops being a decision and starts being a habit.
Outcome 1 — "the bar is right, keep going" — is a perfectly good answer and is
expected to be the common one.

### Cost, accepted

A wrong-score defect that is real and unfixed keeps the UI blocked, and this
ADR does not change that. It cannot: the entire premise of ADR-018 is that a
clickable demo over wrong numbers invites trust the tool has not earned. What
this buys is that the project cannot drift into an unbounded gate without
noticing, and cannot exit one without saying out loud whose risk it accepted.

**Related, and deliberately out of scope:** E1–E5 measure soundness only.
Nothing in the gate tests whether this product, in this shape, is what the
recruiter wants — and the tool has still never been used by the recruiter it is
for. That is a real gap in what "ready" means, but it is not what E1 is for and
this ADR does not conflate them.

---

## ADR-026 — `pdf-lib` and `docx` as fixture-generation dev dependencies

**Date:** 2026-08-13 · **Status:** Accepted

E3 requires a fixture corpus, and the corpus must include real PDF and DOCX
files. The repo has readers — `pdfjs-dist` and `mammoth` — and no writer.

**Why binaries at all, when text fixtures are cheaper.** The text tier feeds
`packages/core` directly and cannot reach `apps/server/src/ingestion` at all.
Scan detection, the Cavnar & Trenkle language classifier and the ADR-022
mixed-language veto are only exercised by real bytes arriving in a real
container. D6 — the detector ranking a French CV as more English than an English
CV — lived entirely in that layer. A corpus that cannot fail the way D6 failed
is not a corpus for this project.

**Why generated rather than committed.** A committed binary cannot be reviewed
in a diff, and when an extraction result changes it is then impossible to tell
whether the fixture moved or the code moved. That ambiguity is the H-037 failure
shape: a stale artifact treated as ground truth. Fixture _definitions_ are
committed as readable source; the binaries are produced from them
deterministically by `scripts/build-fixtures.mjs`, and regeneration must be
byte-identical or the build fails.

### License evaluation (ADR-016 standard)

Every LICENSE file below was opened and read on 2026-08-13. Declared metadata
was **not** treated as evidence.

| Package                   | Declared                    | LICENSE file says                                      |
| ------------------------- | --------------------------- | ------------------------------------------------------ |
| `pdf-lib@1.17.1`          | `MIT`                       | Verbatim MIT, © 2019 Andrew Dillon                     |
| `docx@9.7.1`              | `MIT`                       | Verbatim MIT, © 2016 Dolan                             |
| `@pdf-lib/standard-fonts` | `MIT`                       | Verbatim MIT, © 2018 Andrew Dillon                     |
| `@pdf-lib/upng`           | `MIT`                       | Verbatim MIT, © 2017 Photopea                          |
| `sax@1.6.1`               | `BlueOak-1.0.0`             | Genuine Blue Oak Model License 1.0.0 (see note below)  |
| `jszip@3.10.1`            | `(MIT OR GPL-3.0-or-later)` | Already vetted in ADR-016; arrives today via `mammoth` |
| `pako@1.0.11`             | `(MIT AND Zlib)`            | Already vetted in ADR-016; arrives today via `mammoth` |

The full resolved tree is 26 packages. The remainder declare `MIT`, `ISC` or
`0BSD`, all already on the production allowlist, and the majority
(`jszip`, `pako`, `nanoid`, `tslib`, `readable-stream`, `immediate`, `lie`,
`setimmediate`) are **already in `pnpm-lock.yaml`** via `mammoth` and
`pdfjs-dist`. Genuinely new to the tree: `pdf-lib`, `docx`, the two `@pdf-lib/*`
packages, `sax`, `xml-js`, `hash.js` and a small set of `readable-stream`
helpers.

**On `sax`'s Blue Oak 1.0.0.** It is on `PRODUCTION_ALLOWED` already, but it was
read rather than assumed because it is the one non-MIT-family license in the
set. It is permissive, includes an explicit patent grant, and its only
obligation is a Notices clause requiring the license text to travel with any
copy distributed. Nothing here is distributed: these are dev dependencies used
to generate test fixtures at build time and they do not enter any artifact a
recruiter receives. The obligation does not attach.

### Decision

Add `pdf-lib` and `docx` as **root `devDependencies`**, pinned to exact
versions. They generate fixtures and are never imported by `packages/core`,
`apps/server`, or anything that ships.

**No new `METADATA_WAIVERS` entry is required.** Every package in the resolved
tree evaluates to an allowlisted SPDX expression under `isAllowedExpression`.
This is the first dependency addition since ADR-016 that needs no waiver, which
is a property of these packages and not a relaxation of the gate.

**This ADR is a decision, not evidence (H-025).** The claim that the audit
passes is a prediction until `pnpm license:audit` has been run with both
packages installed. That run belongs to the commit that installs them, and its
output is the evidence.

### Costs, accepted

- **Three new supply-chain entries with no prior presence in the tree** (`sax`,
  `xml-js`, `hash.js`), reaching us via `docx`. Dev-only, so they never reach a
  recruiter, but they are new code on the build machine.
- **`pdf-lib@1.17.1` was last published some time ago.** For deterministic
  generation of simple text PDFs this is close to irrelevant — the PDF text
  operators involved have not changed — but it is noted rather than discovered
  later.
- **Both libraries embed creation timestamps by default**, which would make
  every regeneration look like a change and destroy the byte-identical check.
  Suppressing that is a hard requirement on the generator, not a nicety.

---

## ADR-027 — H-041 is wrong-score; ADR-023's severity split is corrected

**Date:** 2026-08-13 · **Status:** Accepted ·
**Supersedes:** ADR-023 Decision 1's false-refusal example list

H-041/H-068 recorded that the ADR-022 mixed-language veto is silent on
documents whose lines fall below its 15-word floor, so a partly-non-English CV
is scored on its English part. **Whether that is a wrong-score finding under
ADR-023's severity split had never been decided by anyone.** H-055 asserted E5
on the assumption that H-052 was the only open wrong-score entry, and H-063
recorded that the assumption was never checked. This ADR makes the call.

The call was put to an independent ADR-015 verifier that did not author the
corpus, and the verdict was then re-measured a third time by the lead on a
third document in a fourth language. All three measurements agree.

### Decision 1 — H-041 is classified **wrong-score**

The finding is not that the tool reads less text. It is that the tool reports a
different number about the same person depending on which language their
history is written in, and justifies it with a claim that is false.

Measured three times, independently, on three different documents:

```
FIXTURE (H-068)   35% French, prose CV      -> parseStatus ok, language en, SCORED
VERIFIER          37% French, own document  -> score  51, ineligible  vs  100, eligible
LEAD              53% Spanish, own document -> score  56, ineligible  vs  100, eligible
```

The lead's run, same candidate and same facts with only the language of the
earlier role and the degree changed:

```
earlier role + degree in SPANISH   totalYearsExperience = 4.8   SCORE 56   eligible=false
    unmet: Requires at least 9 years of experience; found 4.8.
    unmet: Requires at least a bachelor degree.
earlier role + degree in ENGLISH   totalYearsExperience = 9.1   SCORE 100  eligible=true
```

`whole-document isEnglish = true`, `judgedSegmentCount = 0`, `warnings: []`.
**"Requires at least 9 years of experience; found 4.8" is a fabricated claim
about a real person, presented to the recruiter as evidence.** That satisfies
both clauses of ADR-023's wrong-score definition — "reports a number that is
wrong, **or fabricates evidence for it**" — and its discriminator, "only the
first class can harm a candidate silently."

Three further facts that the classification does not depend on but which bear
on any future fix:

- **The trigger is segment word count, not proportion.** Identical French
  content as two 9-word lines is scored; joined into one 18-word line it is
  refused. A single 18-word foreign sentence is caught at 16% non-English; a
  37% block of 9-word lines is not caught at all.
- **The whole-document backstop is language-dependent.** French flips it
  between 37% and 44% (document-dependent); **Spanish was still classified
  English at 53.3%.**
- **Both existing framings in the log are wrong, in opposite directions.**
  H-041's "terse CVs — pure bullets, skills lists" understates it: 9-12-word
  full sentences are not terse and are never judged. H-068's "it is a property
  of CVs" overstates it: a CV written in 17-18-word prose bullets gets seven
  segments judged and the veto works. **The correct statement is that the veto
  is silent on any document whose lines fall below 15 words** — most CV
  formatting, but not all of it.

### Decision 2 — ADR-023's false-refusal example list is corrected

ADR-023 Decision 1 lists _"The terse-CV blind spot"_ as an example of
**false-refusal**. That is wrong, and it is wrong in a way that matters,
because it is the entry that made this finding look non-blocking for a month.

- The false-refusal **definition** is "the tool declines to score something it
  could have read." The tool does not decline — measured `parseStatus: ok`,
  score persisted to `matches`. And the text it skipped is text it explicitly
  could **not** read. Both halves of the definition fail.
- The false-refusal **rationale** is "the recruiter sees the refusal and the
  document in front of them, so the failure is visible and recoverable." There
  is no refusal to see: `warnings: []`.
- The **discriminator** — "only the first class can harm a candidate silently"
  — is contradicted outright, since this item is in the second class and harms
  a candidate silently.

The same phenomenon was also listed, correctly, under wrong-score as _"a
half-French CV scored on its English half."_ **ADR-023 filed one finding in two
classes**, one of them self-contradictory. Written the day after ADR-022, it
appears to have read the veto's abstention as a refusal.

**Correction, binding from now:** strike _"The terse-CV blind spot"_ from the
false-refusal list. The second example there — a foreign-language quotation
triggering the veto — is a genuine false refusal and stays. The wrong-score
list is unchanged and already names this finding.

**The general rule this establishes, so the same error is not repeated:**
**abstention is not refusal.** When a guard declines to judge, classify by what
the _system_ then does, never by what the _guard_ did. A guard that says
nothing and a system that then says `ok` is an acceptance.

### Decision 3 — E5 is NOT MET, and E2 is NOT MET by entailment

**E5** is "zero open HONESTY_LOG entries classified wrong-score." H-041 is open
and is now classified wrong-score. **E5 is NOT MET.** `docs/PROJECT_STATUS.md`
asserted "E5 — MET" and was false; it is corrected in the same commit.

**E2** is "every wrong-score defect ever found is pinned by a metamorphic or
property test, **not only an example test**." H-041's only pins are the
binary-tier fixture — an example test, which E2 excludes by its own wording,
and which does not assert a score at all — and R-L1/R-L3, which **cannot
construct the failing input**: they draw the foreign text from a fixed set of
long multi-sentence paragraphs, described in the source as _"each long enough
to clear the segment floor."_ **E2 is NOT MET.**

R-L1's own comment states that the defect it exists for "was precisely a
POSITION/LENGTH effect." It generates the CV, the language and the insertion
position, and holds **length** — the axis it names — constant. This is the
vacuous-check pattern of H-004, H-013 and H-060, in a relation written to fix
H-051's vacuity. **A relation that names its defect axis and then does not
generate it is not a pin.**

### What this ADR deliberately does NOT decide

**The remediation is not chosen here.** The 15-word floor is not a free
parameter — 12-18 is the measured window, 20 catches nothing, 10 falsely
refuses a real CV (H-041) — so lowering it trades a wrong score for a false
refusal at a rate nobody has measured on 8-13-word segments, which is exactly
where the failure lives. Choosing between per-segment identification that works
on short fragments, conservative refusal when the veto abstained, and
aggregating consecutive short lines to clear the floor requires measurement
this session did not do, and is the next session's first task.

### Costs, accepted

- **The gate moves backwards, from one disputed criterion to two failed
  ones.** E1 was already NOT MET, so three of five now fail. This is the
  correct reading of evidence that already existed; the previous position was
  more optimistic than the measurements supported.
- **E1's two adversarial rounds are deferred again.** They cannot certify an
  engine with a known open wrong-score defect, and running them now would spend
  rate-limited Opus rounds on a gate that cannot open regardless of outcome.
- **This re-opens a question ADR-023 was written to close.** ADR-023 exists so
  hardening terminates rather than blocking on every gap forever. Classifying a
  finding as wrong-score moves it into the blocking class, which is the
  mechanism ADR-023 warns can make the gate unopenable. **The boundary that
  keeps coverage-gap non-empty:** a coverage gap is an input the product
  accepts as in scope and promises nothing about (UK vocational
  qualifications, non-English degree names). This is an input
  `docs/PRODUCT_DECISIONS.md` commits to **refusing** — "partly-English
  documents are refused, not partly scored" — by a guard built for the purpose
  that does not fire. Failing an existing product commitment in the direction
  of a confident wrong number is soundness, not scope. That line is checkable,
  and it leaves every existing coverage-gap item where ADR-023 put it.

---

## ADR-028 — The gate is computed, not read

**Date:** 2026-08-13 · **Status:** Accepted ·
**Amends:** ADR-023 Decision 1 (E1, E2, E5 mechanics; the severity split itself
is unchanged apart from ADR-027's correction)

**The problem, stated as evidence rather than as a feeling.** Tracing every
gate assertion in `HONESTY_LOG.md`:

| Criterion                         | History                       | Stable? |
| --------------------------------- | ----------------------------- | ------- |
| E3 · corpus exists and passes     | NOT MET → **MET**             | yes     |
| E4 · mutation ≥ 75                | CANNOT ASSESS → **MET** → MET | yes     |
| E2 · defects "pinned"             | NOT MET → MET → **NOT MET**   | **no**  |
| E5 · zero open wrong-score        | MET → disputed → **NOT MET**  | **no**  |
| E1 · two consecutive clean rounds | NOT MET, always               | **no**  |

**The two criteria you settle by running a command converged and stayed
converged. The three that require a human to form an opinion have never
settled.** The source code did not change between most of those flips; the
reader did.

Why each unstable one was unstable:

- **E5** counts "open HONESTY_LOG entries classified wrong-score" — but no
  entry carried a classification. Evaluating E5 meant re-reading 74 narrative
  entries and forming a judgement. Different session, different judgement.
- **E2** required defects to be "pinned", which was never defined. It turned
  out to admit two readings — "a property test exists for the class" versus "a
  property test that can generate the failing input" (H-070). Two readings,
  two verdicts, one flip.
- **E1** required two consecutive adversarial rounds to find no new wrong-score
  defect, with any finding resetting the counter. Against an unbounded
  adversary on a codebase this size, that has no reachable end state.

Two amplifiers: the method has an adversary whose job is to falsify and **no
counterpart operation that closes anything**, so the open set only grows while
E5 is defined as zero over it; and the criteria are coupled through
classification, so one judgement moved both E5 and E2 on 2026-08-13 and looked
like the gate collapsing.

### Decision 1 — `docs/findings.json` is the registry, and it decides E5

Every finding carries a machine-readable `severity` and `status`. `pnpm gate`
counts them. **E5 is now a command's exit code, not a reading.**

`HONESTY_LOG.md` remains the append-only narrative and is still where reasoning
lives. The registry is the index the gate is computed from. Changing a gate
result now requires editing a tracked file — a visible, reviewable act that
shows up in a diff — rather than something that can happen by re-reading prose.

**`severity: unclassified` is a first-class value and it BLOCKS E5.** A finding
nobody has triaged is not evidence of safety; treating it as harmless is
exactly the assumption H-055 made and H-063 caught. Blocking makes the
untriaged set finite, named, and visible in one command instead of surfacing
one entry per session.

**It found two on its first run.** `H-002` (cross-machine determinism) and
`H-040` (tenure understated when ranges do not parse — "a 3-year parsed role
beats a 20-year claim") both have wrong-score shape, both predate ADR-023's
split, and **neither had ever been triaged.** H-040 is the same shape as H-041.
Under the old scheme they would have surfaced one per session over months.

**The completeness check runs in both directions**, and that is the load-bearing
part: a finding in the log but not the registry fails the gate. H-004 and H-044
are both cases of a registry quietly covering less than it appeared to, and a
gate computed from an incomplete index is worse than no gate, because it
reports a number it did not earn.

### Decision 2 — E2 is derived from E5, not tracked separately

**"Pinned" now has one mechanical definition: a test that fails when the fix is
reverted.** That is what mutation testing already measures, so E2 needs no new
machinery.

An OPEN wrong-score finding is by definition unfixed, so it cannot be pinned.
**E2 therefore cannot pass while E5 fails, and is computed as `e2 = e5`.** One
fewer criterion decided by opinion, and no loss of coverage: the thing E2
protected — that a fix is held in place by a test rather than by an example —
is exactly what E4's ratchet enforces.

### Decision 3 — E1 becomes a finite checklist

`docs/ATTACK_CHECKLIST.md` lists twelve attack classes drawn from every defect
class this project has actually found. **E1 is met when every row has been
executed and every wrong-score finding it produced is fixed and registered.**

A round no longer resets on a finding. A genuinely new attack idea becomes a
new row, added deliberately, and the gate is re-run against it.

**This is not a weaker bar.** The old one was unreachable, and an unreachable
bar protects nobody: it kept the UI blocked for the project's entire life while
a real wrong-score defect (H-041) sat open and unclassified for a month,
because attention went to the counter rather than to the defect. The checklist
already shows three rows with open or untriaged findings and one never run —
so it is not rubber-stamping anything.

### Costs, accepted

- **The registry can drift from the narrative.** Mitigated by the two-way
  completeness check, which is itself tested (`gate-registry.test.mjs`,
  including a test asserting the heading matcher does NOT match prose mentions
  — otherwise the check would be vacuous, the H-060 shape).
- **`unclassified` blocking E5 means the gate got harder today, not easier.**
  Three findings block instead of one. That is the honest number and it is the
  first time it has been computed rather than argued.
- **Collapsing E2 into E5 loses an independent signal.** Accepted: it was not
  independent in practice — it was decided by the same classification E5 uses,
  which is why both flipped together.
- **A checklist can be gamed by writing narrow rows.** The rows are derived
  from defects already found, not invented, and rows may only be marked covered
  by pasted output. This is a real residual risk and is not fully closed.

---

## ADR-029 — One principle for both silent-number defects; the line window lands

**Date:** 2026-08-13 · **Status:** Accepted, **with one product question open**

H-040 and H-041 are the same defect wearing different clothes. In both, **the
engine holds evidence that its own output may be unaccounted-for, and drops it
silently:**

- **H-041** knows it judged zero segments, and concludes "English".
- **H-040** extracts an explicit 20-year claim, discards it, and reports 2.9.

### Decision 1 — the principle

**A number must not be presented as complete while the engine holds
unaccounted-for evidence. The burden is on the engine to show the gap does not
matter, never on the reader to notice.**

Both defects invert that today: they assume immateriality by default. This is
C7 restated for the case where the engine _half_-read something, and it is the
generalisation of ADR-027's "abstention is not refusal".

Materiality is computable for H-040 (recompute eligibility using the discarded
claim) and not for H-041 (we cannot know what the unjudged text says), which is
why the two need different enforcement but the same rule.

### Decision 2 — a prose-gated line window closes most of H-041

Segments were taken at paragraph and sentence granularity. On a CV both
coincide with the line, CV lines run 8-13 words, the 15-word floor discarded
every one, and `judgedSegmentCount` came back 0 on most real documents. **This
is the "fragmenting the evidence below the floor discarded it" failure the
module already documents at sentence granularity — one level up.**

A third granularity now groups consecutive lines until they clear the floor.

**Measured, and the measurements chose the design:**

| Variant                      | False refusals /10 | PDF path                     |
| ---------------------------- | ------------------ | ---------------------------- |
| Blank-line-delimited runs    | 0                  | **fails below ~49% foreign** |
| Sliding line window          | 1                  | catches down to 11.2%        |
| Line window **+ prose gate** | **0**              | **catches down to 11.2%**    |

Blank-line runs were the cheaper implementation and are **not viable**: PDF
extraction loses blank lines (H-062/H-065), so a PDF collapses to one run and
dilutes. PDF is the dominant real format. That is a design killed by
measurement, and it would not have been visible from reading the code.

The prose gate exists because the raw window costs one false refusal —
`logistics_headers`, whose opening window is a name, an email and
comma-separated proper nouns, read as French. That is the coin-flip case
`MIN_WORDS_FOR_SEGMENT_JUDGEMENT` already warns about, and H-041's own
calibration rejected a setting costing 1 in 10. Measured separation:

```
header soup   0.00      English prose   0.81      French prose   0.90
```

Every threshold in [0.30, 0.70] gives the same result, so **0.5 is mid-gap, not
tuned to an edge** — unlike the word floor, whose viable window was a narrow
12-18.

**Result, stated precisely and not rounded up.** Held-out CVs left unjudged:
**4 of 10 → 1 of 10.** False refusals: **0**. All four held-out non-English
CVs still refused. The bilingual defect is caught in French and Spanish, in
both PDF and DOCX, down to 11.2% foreign content.

**H-041 is NARROWED, NOT CLOSED.** `logistics_headers` is pure header soup with
no prose line anywhere, so every window falls below the gate and the check is
silent. **A CV of that shape, written bilingually, is still scored.** It stays
classified wrong-score.

### Decision 3 — H-073 is closed on the way past

The documented-gap fixture was titled "a 35%-French full-length CV is SCORED"
and never computed a score. It now asserts the refusal, the refusal _reason_,
and that the veto fired **because a passage was judged** rather than because
the whole-document classifier happened to flip — so a future regression cannot
keep it green while the remedy rots.

### What is deliberately still open

**The residual of H-041 and the whole of H-040 hinge on one product question:
when the engine cannot account for something, does it refuse, or does it score
and surface a caveat?** Refusing is gate-safe (ADR-023: false-refusal does not
block) and costs the recruiter manual review; a caveat keeps throughput but
leaves a wrong eligibility verdict on screen next to a warning. That is a
product call with measured costs on both sides, and it is not the lead's to
make. Recorded here rather than resolved.

### Costs, accepted

- **A CV in heavy Title Case prose** scores lower on the prose ratio and may
  fall below the gate, in which case that window is skipped and the check is
  silent for it. Conservative direction, but unmeasured — the corpus has no
  such CV.
- **The window is O(lines × window size)** per document. Bounded by
  `MAX_LINES_PER_WINDOW = 12`, and measured at no perceptible cost on the
  corpus, but it is more work than the previous two-granularity split.
- **`logistics_headers` remains unjudged**, and with it the residual
  wrong-score path above.

---

## ADR-030 — Language-neutral vs language-bearing: three signals, and the floor's unit was the bug

**Date:** 2026-08-14 · **Status:** Accepted ·
**Supersedes:** ADR-029 Decision 2's prose gate

ADR-029 gated windows on "share of plain lowercase tokens". H-079 measured that
as **English/Romance-biased**: German capitalises every noun, so German header
lines read as label soup, were skipped, and a German-English bilingual header CV
was scored.

**Building the replacement found a deeper cause than the gate.**

### Finding 1 — the 15-WORD floor is biased against compounding languages

| block     | words | letters | letters/word |
| --------- | ----- | ------- | ------------ |
| EN header | 18    | 122     | 6.8          |
| FR header | 19    | 124     | 6.5          |
| DE header | 10    | 120     | **12.0**     |
| NL header | 11    | 121     | **11.0**     |
| SV header | 11    | 115     | **10.5**     |

All five carry the same amount of text. Only the compounding languages fail a
**word** count. **The gate was a symptom; the floor's unit was the defect.**
Windows are now sized in **letters** (100 ≈ the old 15 English words at the
measured 6.7 letters/word).

### Finding 2 — for German, the classifier itself is wrong, so no gate can help

A German compound-noun list is out-of-domain for reference profiles built from
prose. Measured on the German header block:

```
isEnglish=true   dEn=69621   dOther=70385   nearest=it
```

It is classified **English**, with **Italian** as the nearest other. Judging it
more eagerly produces a confident wrong answer, so a second, orthogonal signal
is required.

### Decision — three signals, each measured, replacing one biased heuristic

1. **Letter floor** (`MIN_LETTERS_FOR_WINDOW = 100`) — language-fair sizing.
2. **Confidence margin** (`MIN_FOREIGN_MARGIN = 0.03`) — act on a foreign
   verdict only when the foreign profile wins clearly. Measured: worst English
   window `+0.0180`, Dutch header `+0.0399`, French prose `+0.0968`, French
   header `+0.1413`. 0.03 is mid-gap. **Language-symmetric** — it asks how
   confident the verdict is, never what the text looks like.
3. **Compounding morphology** (`MAX_ENGLISH_MEAN_WORD_LENGTH = 9.4`) — catches
   German where the profiles fail. Measured: worst English window **8.36**,
   Swedish **10.45**, Dutch **11.00**, German **12.00**.

Neutral tokens (emails, URLs, digit-bearing tokens, ALL-CAPS acronyms) are
stripped before judging. **Capitalisation is deliberately NOT used** — that was
the bias.

**Measured result across the full grid** (floor 85/100 × margin 0.02/0.05 ×
compound 9.0/9.4/10.0): **0 false refusals over all 18 English CVs**, 13/13
non-English refused, FR/ES bilingual prose caught, and **DE/NL/SV/FR bilingual
headers caught**. Every held-out English CV now has judgeable evidence —
`logistics_headers` went from 0 judged segments to 4.

### H-041 is NOT closed, and the remaining gap is exactly what H-041 first said

A second adversarial round found the residual:

```
ES three lines (145 foreign letters)   refused
DE two compound lines (72 letters)     SCORED
FR one line (35 letters)               SCORED
```

**A foreign insert below the letter floor is never isolated** — the window
grows past it into English text and dilutes. This is material: a single line
like "Licenciatura en Ciencias de la Computacion, Universidad de Salamanca" is
~70 letters and carries a degree.

**This is the original H-041 statement, now correctly scoped:** closing it
needs per-segment identification that works on ~5-8 word fragments, which
character-statistics cannot do. Everything _above_ that threshold is now
handled; below it, nothing has changed. H-041 stays **wrong-score** and E5
stays blocked.

### Costs, accepted

- **9.4 is the narrowest threshold in this module** — 8.36 to 10.45, backed by
  18 English CVs. An English CV of unusually long compounds
  ("Telecommunications Infrastructure Modernisation Programme") could exceed it
  and be falsely refused. Stated, not smoothed over.
- **Three thresholds instead of one.** More surface to drift. Each is asserted
  in the eval file against both English corpora rather than described.
- **Mutation score is unaffected**: `languageDetection.ts` is in `apps/server`,
  outside Stryker's `packages/core` scope — so it carries no mutation number at
  all, which is its own gap (same shape as `scripts/lib`, H-057).

---

## ADR-031 — `eld` replaces the hand-built language classifier, and does not close H-041

**Date:** 2026-08-14 · **Status:** Accepted · **Supersedes the classifier half
of ADR-030**

The user approved adopting a real language-ID library to close H-041's
Germanic sub-floor residual. **It does not close it, and this ADR adopts the
library anyway — for a different and better-evidenced reason.**

### What was measured

64 configurations: 4 granularities × 2 input conditionings × 4 ngram tiers ×
`reliable` on/off, against `ENGLISH_CVS` (8), `HELD_OUT_ENGLISH_CVS` (10),
`INDIAN_ENGLISH_CVS` (5), all 13 non-English CVs, and 13 Germanic sub-floor
lines. Corpora were programmatically diffed against the eval file — 0 key
mismatches, 0 text diffs — rather than hand-copied. Full data in
`docs/research/langid-phase1-2026-08-14/` (H-092).

| granularity            | Germanic caught | English CVs falsely refused | non-English refused |
| ---------------------- | --------------- | --------------------------- | ------------------- |
| `windows100` (current) | 0-1/13          | **0/23**                    | 13/13               |
| `linePairs`            | 0-1/13          | 0-1/23                      | 13/13               |
| `lines` + `reliable`   | **13/13**       | **2/23**                    | 13/13               |

**No configuration satisfies both axes.** The two are not independently
tunable: at the granularity that costs nothing the library is blind to the
sub-floor class, and at the granularity that catches it, it refuses two real
English CVs (`chef_terse`, `driver_very_terse`).

**H-041 is a segmentation problem, not a classifier problem.** A trailing
sub-floor line never forms a window under `lineWindows`' forward-growth rule,
and pairing it with its one English neighbour dilutes it identically.
Reproducing that with a trained model instead of the hand-built profiler is
what settles it: **swapping the classifier was never going to fix it.** That
correction is the most valuable output of this work, and it invalidates the
plan the previous phase brief was built on.

### Decision

Adopt **`eld@2.1.0`**, pinned exact, as a **production dependency**, at
**window granularity** behind the existing `findNonEnglishSegments` seam, using
the **`extrasmall`** ngram tier.

**Deleted, not layered over** (ADR-023's "replace, don't stack"):

- the entire Cavnar & Trenkle apparatus — `LANGUAGE_TRAINING_TEXT`,
  `LANGUAGE_PROFILES`, `buildProfile`, `rankedProfile`, `outOfPlaceDistance`,
  `ngramCounts`, `ngramsOfWord`, `detectLanguageHeuristic`;
- `MAX_ENGLISH_MEAN_WORD_LENGTH` (ADR-030);
- `ENGLISH_INSTITUTION_WORDS` / `isEnglishInstitutionText` (H-086);
- `MIN_FOREIGN_MARGIN`.

**Those three thresholds exist only to patch the profiler's blind spots.** The
profiler mis-scores the H-079 German header block as English (`dEn 69621` vs
`dOther 70385`); it is caught today by mean-word-length, which then had to be
exempted for Indian institution names after it falsely refused 2/5 Indian CVs.
`eld` catches that case in all 36 supplementary combinations **with no
exemption**, so the patches have nothing left to patch. Net heuristic count
goes **down**, which is what Task A actually existed to do.

**Explicitly NOT deleted:** `NON_ENGLISH_FUNCTION_WORDS` /
`MIN_FUNCTION_WORD_HITS` (the H-087 Romance sub-floor pass). Replacing it with
an `eld` line pass would cost 2/23 English CVs it currently costs 0/23. That is
a net regression, not a subsumption.

**Rejected: the line-granularity pass that would have closed H-041.** It flips
E5 by trading a blocking wrong-score for a non-blocking false-refusal, at
2/23 ≈ 8.7%. **The user rejected this same trade at 3/18 ≈ 17% in H-080** and,
asked again with the cheaper number, rejected it again. H-041 will be closed as
a segmentation change or not at all.

### License evaluation (ADR-016 standard)

LICENSE files opened and read 2026-08-14, in an isolated install outside the
repo. Declared metadata was not treated as evidence.

| Package     | Declared     | LICENSE file says                                                           |
| ----------- | ------------ | --------------------------------------------------------------------------- |
| `eld@2.1.0` | `Apache-2.0` | `node_modules/eld/LICENSE` — genuine Apache License 2.0, full standard text |

**Zero transitive dependencies** — `package.json` carries no `dependencies`
key, and `npm ls --all` on an isolated install resolves to exactly one package.
Apache-2.0 is already on `PRODUCTION_ALLOWED`. **No `METADATA_WAIVERS` entry is
required.**

**`franc` rejected on measurement, not licence** — 10/13, because it is itself
a trigram classifier, the same method as the code it would have replaced
(H-091). It also ships no LICENSE file in its tarball.

**`cld3-asm` rejected on licence evidence the audit script cannot see.**
`emscripten-wasm-loader@3.0.3` ships **no LICENSE file in the npm package and
has none in its GitHub repository**; its MIT declaration is unverified
metadata, and `license-audit.mjs` would pass it silently because the script has
no mechanism to notice an absent LICENSE file. It also pins `nanoid@2.1.11`
(2020), carrying high-severity `GHSA-2v37-7h3g-55p8`. **That blind spot in our
own audit script is a finding in its own right and is not fixed by this ADR.**

**`tinyld@1.3.4`** is clean (MIT, zero deps) and is the credible runner-up at
33/96, ~3.7× worse than `eld` on the false-refusal axis.

### Constraint compliance, verified rather than assumed

- **C4 determinism** — zero real `Math.*` calls in `languageDetector.js`; the
  grep hits were `/**` comment asterisks. Only IEEE-754 `+ - * /`, correctly
  rounded on every conforming platform. This is H-002's own reasoning.
- **C2 offline** — no network and no `fs`. The single dynamic `import()` in the
  default entry resolves a local ngram file; the `static.*` entries avoid even
  that.
- **C5** — a language identifier is not generative, and it sits in ingestion,
  outside the scoring path.

### This ADR is a decision, not evidence (H-025)

The claim that `pnpm license:audit` passes was a **prediction** until it ran
with `eld` installed.

**It has now run, and this is the evidence:**

```
$ pnpm --filter @matchdesk/server add eld@2.1.0 --save-exact
$ pnpm license:audit
License audit (ADR-003)
  production deps audited: 34 (strict allowlist)
  development deps audited: 305 (strict + MPL-2.0)
  ⚠ waived: duck@0.1.12 declares "BSD", verified as BSD-2-Clause (ADR-016)
✅ License audit passed — no disallowed licenses.
```

Production dependencies went **33 → 34** — exactly one, confirming the
zero-transitive-dependency claim was true of the resolved tree and not only of
the manifest. No new `METADATA_WAIVERS` entry was needed. `pnpm why eld`
reports a single version reached only by `@matchdesk/server`, and the installed
copy carries its `LICENSE` file.

It is declared on **`apps/server`**, not the root, because that is the only
package that may import it. `packages/core` must never see it — the
determinism arch test exists to keep inference runtimes out of core.

### Costs, accepted

- **A production dependency that ships to the recruiter**, where previously
  this file had none. Zero transitive packages is the mitigation, not an
  absence of cost.
- **~0.90 MB raw / ~0.26 MB gzip** of ngram data at the `extrasmall` tier.
  Approximate: measured on installed source, not a shipped bundle.
- **H-041 remains open and E5 remains NOT MET.** This ADR buys simplification,
  not the gate. Anyone reading it as "the language work is done" has misread it.
- **A trained model is opaque in a way the hand-built profiler was not.** When
  it misclassifies, there is no threshold to inspect. Accepted because the
  profiler's transparency was not buying correctness — it needed three
  hand-tuned patches and still mis-scored the H-079 case.
- **`eld` is a single-maintainer package.** Pinned exact, and a new version
  must be re-measured against all four corpora before it is taken.

---

## ADR-032 — An unreadable date is evidence, not silence (extends ADR-029)

**Date:** 2026-08-14 · **Status:** Accepted · **Extends ADR-029**

H-089 and H-095 are one root cause with two opposite symptoms. `DATE_TOKEN`
matched only _unambiguous_ three-part numeric dates and only `/` and `-`, so
any other three-part date was never consumed whole and `RANGE_PATTERN` fell
back to matching a **substring** of it:

```
"03/04/2019 - 05/08/2022"  -> role DELETED entirely
"03/04/2019 - Present"     -> 5.2y,  evidence "04/2019 - Present"   (leading 03/ discarded)
"04/03/2013 - Present"     -> 11.3y, evidence "03/2013 - Present"   (reads MARCH)
"03-04-2013 - Present"     -> 11.4y, evidence "2013 - Present"      (truth 11.2)
```

**The engine already committed to a locale — by accident, through a fallback.**
An earlier code comment claimed the ambiguous case was "deliberately left
unresolved rather than silently guessing"; an independent verifier falsified
that (H-094). Being wrong by accident is not better than being wrong on
purpose, and it is harder to find.

### Decision

**1. Consume the whole token.** `DATE_TOKEN` now matches any
`NN[/-.]NN[/-.]YYYY`, placed before the two-part and bare-year alternatives.
This alone ends every substring truncation, which was the mechanism behind both
findings.

**2. Classify, never guess.** `parseDateToken` returns a discriminated
`resolved | ambiguous | invalid`. Exactly one side in 13-31 resolves — a number
above 12 cannot be a month in any locale, which is the one fact that holds
everywhere. Both sides ≤ 12 is **ambiguous** and is refused.

**3. An unreadable range is emitted as evidence, not dropped.** A new
span-carrying `unreadable_date_range` attribute records that an employment
range was present and could not be read; `reservationsFor` raises an
`unreadable_employment_dates` reservation. `Reservation` becomes a discriminated
union. `apps/server`'s `scoreStoredPair` already refuses to persist on any
blocking reservation and is kind-agnostic, so it needed no change.

**Materiality is computed, not guessed — and this is the part worth reading.**
ADR-029 could compute materiality because H-040 had two numbers to compare: the
claim and the total. H-089 has none — the engine never extracted a first number,
which is why `discardedTenureClaim` is blind to it by construction (H-094).

So the bound is computed differently: resolve the range under **both** locale
readings and take the **smaller** duration. That is a true lower bound on the
missing tenure under _either_ reading, so it commits to no locale while still
being a real number. If adding it to the computed total would flip the
eligibility verdict, the reservation blocks.

### Why not simply pick DD/MM

It is right for the target recruiter's Indian clients and wrong for US CVs, and
the tool cannot tell which it is holding. The measured spread is also small
enough to make guessing pointless and silence expensive: the two readings of
`03/04/2019 - 05/08/2022` differ by **0.1 years**, and across all 20736
ambiguous combinations the maximum disagreement is **1.8 years** — while
deleting the role cost **9.3 years** in the traced case. **Abstaining silently
was strictly worse than either guess for any role longer than 1.8 years.**

### Costs, accepted

- **A new attribute kind and a wider `Reservation` union.** Every consumer that
  filters `years_experience` had to be checked; `totalYearsExperience` and
  `discardedTenureClaim` are unaffected because they already filter by kind.
- **Concurrent unreadable ranges cannot be interval-merged.** Two ambiguous
  ranges each contribute their own lower bound, and neither resolves to
  absolute months, so overlap between them cannot be deduped the way
  `totalYearsExperience` dedupes readable ranges. Recorded in `dimensions.ts`.
- **The two-part dotted form `03.2006` — H-040's original notation — remains
  open.** `numericMonthYear` stays slash-only. Stated here rather than
  discovered later.
- **More documents will now raise reservations**, which is the point, but it
  means the recruiter sees more caveats than before. That is the trade ADR-029
  already made: a visible caveat beats a confident wrong number.

---

## ADR-033 — A declared licence with no text is unverified (extends ADR-016)

**Date:** 2026-08-14 · **Status:** Accepted · **Extends ADR-016**

`license-audit.mjs` validated a package's **declared** SPDX expression and had
no mechanism to notice that the package **ships no licence text at all**.

Found during the ADR-031 survey: `emscripten-wasm-loader@3.0.3` declares `MIT`
and ships no LICENSE in its tarball, has none in its GitHub repository, and
GitHub's own detector reports `license: null`. Our audit would have passed it
silently. **ADR-016 exists to stop exactly this** — it refused `duck@0.1.12`'s
bare `"BSD"` because the gate "correctly refused to guess" — but an
unverifiable-because-absent licence is the same problem wearing better
metadata.

**Measured before designing:** **2/34** production packages ship no discoverable
licence text (plus one dev-only). Detection covers `LICENSE`/`LICENCE`/
`COPYING`/`NOTICE` in any case and extension, the `LICENSE-MIT` suffix shape,
and ATX _and_ Setext licence headings in a README — the first, narrower version
of the check wrongly flagged four legitimate packages until it learned those.

### Decision

The audit fails a package that ships no licence text, with a second waiver map
in ADR-016's shape — exact-version-pinned, evidence required, printed every run.
Waivers carry an explicit **`basis`**, because two very different things were
otherwise about to share one label:

- **`verified-elsewhere`** — the text was located and read outside the tarball.
  `@napi-rs/canvas-darwin-arm64@1.0.5` is the platform half of a package whose
  sibling ships full MIT text, confirmed independently via GitHub's licence API.
  This is `duck@0.1.12`'s situation.
- **`no-text-exists`** — the declaration is valid, unambiguous SPDX but there is
  **no text anywhere**, and the evidence records where we looked and that it
  came back empty. **This is a risk acceptance, not a verification**, it prints
  under its own banner with a count, and flattening it into the first category
  would be precisely the "waving through a licence nobody has read" ADR-016
  refused.

`dingbat-to-unicode@1.0.1` (production, via `mammoth`) and `stackback@0.0.2`
(dev, via `vitest`) are waived on the second basis. Their objection is **weaker**
than ADR-016's original one: both declare valid, unambiguous identifiers, so
what is missing is corroboration rather than clarity — unlike bare `"BSD"`,
whose ambiguity between 2-, 3- and 4-clause carried materially different
obligations.

**Rejected: a bare hard failure with no waiver path.** `license:audit` runs in
the husky **pre-commit hook**, so a red audit blocks every commit in the
repository — the gate would be breaking a different gate, the failure ADR-026
already records for `.stryker-tmp` ("a gate must not be breakable by another
gate"). A check that red-lights the build on day one over transitive packages
nobody here controls gets reverted, and then the hole is invisible again.

**Rejected: scoping the check to production only.** It would have hidden
`stackback` and made the number look better without making the tree safer.

### Costs, accepted

- **Two live risk acceptances**, one of which ships to the recruiter. Visible on
  every run rather than invisible, which is the whole improvement — but it is
  an acceptance, not a fix. Replacing `mammoth`'s `dingbat-to-unicode` is a
  dependency decision nobody has taken.
- **The check reads the filesystem for every audited package**, ~340 of them,
  on every run and therefore on every commit.
- **Detection is heuristic.** A package could carry licence text in a form none
  of the patterns recognise and fail wrongly; the waiver path is the remedy, and
  `hasLicenseText` deliberately fails an empty path list rather than passing it,
  so an unresolvable package cannot slip through the way the original hole did.

---

## ADR-034 — An unmet must-have may not be asserted from silence (closes H-041)

**Date:** 2026-08-14 · **Status:** Accepted · **Extends ADR-029**

H-041 was open across five sessions. Every attempt to close it tried to detect
the foreign line better. **That was the wrong problem**, and the measurement
that proves it is H-112: at line granularity a person's **name is foreign
text**. `"Nguyen Thi Minh Anh"` scores Vietnamese at 0.834 with English at
0.000 — a stronger foreign signal than any genuine foreign line measured. Every
evidence floor low enough to catch a short foreign degree line also refuses
candidates in proportion to how non-Anglo their name is, and four of the names
it refuses come from this project's own `INDIAN_CV_CORPUS`. Margin thresholds,
absolute-score cuts, a 40-point grid and larger ngram tiers were all measured
and all rejected.

**The actual defect was never detection.** It is that the engine reports
`"Requires at least a bachelor degree"` when it extracted **no education at
all** — asserting a negative from silence. That sentence is a claim about a
person, and the engine cannot support it when it is holding text it could not
read. Measured, it flipped the same candidate between 100/eligible and
50/ineligible on nothing but the language their degree was written in.

### Decision

`apps/server` emits an `unreadable_section` attribute for a line it cannot read
**inside a recognised section whose dimension has no other evidence**.
`scoreCandidate` raises a **blocking** `unsupported_negative` reservation when a
must-have in that dimension is unmet. `scoreStoredPair` and the batch path
already refuse on any blocking reservation (H-099), so the wrong verdict reaches
neither the recruiter nor the `matches` table.

**Two gates make a 2-word evidence floor safe where 6 was required before, and
neither is a threshold on the classifier's output:**

1. **Inside a recognised section.** A CV's name sits above the first section
   header, so it is never judged. This is what buys back the floor — names, not
   short lines, were what made a low floor unsafe.
2. **The dimension has no other evidence.** A technology list reads as foreign
   to any classifier (`"Java, Spring Boot, PostgreSQL, Docker, AWS"` reads as
   Swedish) but produces skill attributes, so nothing is being asserted from
   silence and nothing is emitted.

**Measured: 0 of 50 documents** — all 23 English CVs plus the entire fixture
corpus — produce an attribute here, while a foreign Education line is caught in
German, Dutch, Turkish, Hungarian, Greek, Vietnamese, Russian, Japanese and
Arabic.

**Why the language signal is kept**, when a simpler rule exists. Dropping it —
"Education section present, zero education evidence, must-have unmet" — closes
even the transliteration residual and needs no classifier. It costs 1/50
documents, and the shape it refuses is a CV listing institutions and dates with
no degree token (`"University of Manchester, 2009-2013"`), which is common in
real CVs. That trades a rare defect for a frequent refusal. Recorded as H-114 so
it is not "simplified" into later.

### Costs, accepted

- **A new attribute kind crossing a package boundary.** `packages/core` must
  never import an inference runtime (`core-determinism.test.mjs` enforces it),
  so the language judgement happens in `apps/server` and reaches scoring as an
  attribute — the same bridge `unreadable_date_range` uses.
- **Bare-ASCII transliteration is still missed** (H-113). Hungarian, Greek and
  Vietnamese are all caught in native orthography and all missed with the
  diacritics stripped. Recorded as a coverage-gap rather than wrong-score
  because that is not a CV format; it is an artefact of writing test data around
  the corpus's WinAnsi font constraint (H-067). **It would have been easy to
  record "eld cannot do Hungarian" as the residual, and it would have been
  false.**
- **A foreign line in a dimension that HAS other evidence still moves the score
  without flipping eligibility**, and raises nothing. That is the boundary
  ADR-029 already accepted for H-040 and is unchanged here.
- **More documents will reach the needs-attention tray.** That is the trade: a
  visible "we could not read this" instead of a confident wrong verdict.

---

## ADR-035 — The pre-UI surface: HTTP API, scoring-config bridge, deletion

**Date:** 2026-08-17 · **Status:** Accepted

Three things stood between "a rigorously tested library" and "a UI can be
built", and nothing else did:

1. **Nothing served.** `apps/server` was a callable module; there was no HTTP
   layer, no entry point.
2. **No path from a stored job to the engine.** Every `ScoringJob` spec in the
   project's history was hand-built inside a test. A recruiter had no way to
   create a scoreable job at all.
3. **No deletion**, which PRODUCT_DECISIONS makes a v1 requirement of the
   privacy boundary.

### Decisions

**The API is `node:http` with zero new dependencies.** Uploads are raw bytes
with metadata in query parameters, so no multipart parser enters the supply
chain — ADR-003/ADR-033 make every new package expensive on purpose, and a
JSON-plus-bytes API needs none. No framework: twelve routes do not justify one.

**Loopback is enforced at the socket, plus a Host-header check.** `serve.ts`
binds `127.0.0.1` with no option to widen it — C3 is a property of the code,
not a config flag. The Host check exists because a loopback bind alone does
not stop DNS rebinding: a hostile page can point its own hostname at
127.0.0.1 and the browser will connect. No CORS headers, deliberately — the
production UI is served same-origin, and the dev UI proxies `/api`.

**The scoring config is a zod-validated blob, split from the display layer.**
`job_scoring_configs` stores exactly core's `Job` minus `id`, validated on
every write AND read; the existing `job_requirements` table remains the
display/evidence layer. Compile-time drift pins (`DeepRequired` both ways,
plus literal-union pins for the enums) make divergence between the stored
shape and the engine's input a type error. The pins caught their first
mismatch during their own construction.

**Requirement proposal IS the extractor.** PRODUCT_DECISIONS demands
deterministic, source-backed proposal with recruiter confirmation. There is no
separate proposal engine: the same gate-hardened `extractAttributes` that
reads CVs reads the job description, so every suggestion carries an evidence
span and anything the extractor cannot support is simply not proposed.
Proposals are never `mustHave` and carry no chosen weights — those are the
recruiter's calls. An unconfirmed job is **not scoreable**; there is no
"score with defaults" path. The proposed degree level is the LOWEST found,
because "Bachelor's required, Master's preferred" states a bachelor minimum
and proposing higher would silently tighten a gate.

**Batch skips now carry their reason.** `scoreJobAgainstCandidates` returns
`{candidateId, reason, details}` — `not_scoreable` (ingestion refused; the
candidate row carries why) or `blocking_reservation` (the engine refuses to
assert a number; the reservation sentences travel with the skip). The
needs-attention tray cannot be a first-class surface if the API only says
"skipped".

**Deletion cascades in SQL and audits opaquely.** Derived rows go via the
`ON DELETE CASCADE` the schema already declares. The content-addressed file is
unlinked only when no other row references its hash. The audit entry records
the opaque id and the action — never PII, never source text.

### Costs, accepted

- **Two clocks enter at the edge.** `serve.ts` passes wall-clock
  `referenceDate`/`computedAt` per request; the pipeline already persists both
  with every score (ADR-024), and tests inject fixed values.
- **A `as ScoringJob` cast** bridges zod's `T | undefined` optionals to core's
  plain optionals under `exactOptionalPropertyTypes`. Runtime-safe (JSON
  cannot carry `undefined`); the drift pins carry the real safety.
- **The API returns full score results transiently** and persists only the
  match row, per ADR-024 — a UI wanting an old result re-scores, which is
  measured cheap (0.34 s for a full 200×200 fill).
- **20 MB upload cap** — generous for documents, bounded for memory.

---

## ADR-036 — The UI: zero-dependency, zero-build, served by the API itself

**Date:** 2026-08-17 · **Status:** Accepted

`apps/web` is vanilla ES modules and CSS, served as static files by the
existing server. **No framework, no bundler, no new packages of any kind.**

### Why no framework

Four views for one local user do not amortize a build toolchain. A React +
Vite setup would have added dozens of packages to a tree whose licence gate
(ADR-003/016/033) makes every entry expensive, plus a build step, plus a dev
server — to render lists and cards the DOM API renders directly. The UI is
JSDoc-typed and typechecked (`tsconfig.web.json`, `checkJs`, DOM lib) exactly
as the build tooling already is; pure logic (ranking, evidence highlighting)
lives in `lib/*.mjs` and is unit-tested in node.

### Design system

Apple-grade minimalism with an ambient layer: system font stack, hairline
borders, frosted-glass cards, and three oversized gradient orbs that drift on
keyframes and parallax against scroll and pointer via CSS custom properties
fed by one rAF loop. Light and dark themes from one token set;
`prefers-reduced-motion` disables all of it.

**Measured, not assumed, on the ambient layer:** the first version used
`filter: blur(70px)` over the orb container, and a viewport-sized blur layer
froze rendering under scroll in testing. The blur was replaced by gradient
falloff — visually equivalent, compositor-cheap. `scroll-behavior: smooth`
was removed for the same class of reason.

### Rules the UI inherits from the engine

- **A displayed number is never wrong, even transiently.** A count-up
  animation was built, measured freezing mid-count in a throttled tab —
  showing "8" for a candidate who scored 78 — and removed. Scores and
  composition bars render their true values immediately; only decorative
  arcs animate, so a stalled frame scheduler can leave decoration undrawn
  but never a false number.
- **No HTML string concatenation exists.** Everything renders through
  `createElement`/`textContent`, and the static handler's CSP
  (`default-src 'self'`) makes the alternative a runtime error. Uploaded
  document content cannot become markup.
- **Names are filenames.** PRODUCT_DECISIONS forbids displaying guessed
  candidate names; every list shows `originalFilename`.
- **The needs-attention tray shows why**: ingest warnings on candidate
  cards, and per-skip reasons (including blocking-reservation sentences)
  after scoring.

### Verified in a real browser

The full recruiter workflow was driven end-to-end against the live server:
upload → proposal chips (Python/Go/microservices found in the real job PDF,
degree pre-filled) → must-have toggle → confirm → score → ranked results
(78 eligible above 38; French CV in the tray with its reason) → detail view
with evidence marks on the exact phrases in the document. Light and dark.

### Costs, accepted

- **The match matrix (secondary view) is not built.** The ranked list is the
  defining workflow; the matrix comes when a real pool needs it.
- **`serve.ts` and the DOM code are not unit-tested** — wiring and rendering
  are covered by the API e2e tests, the pure-logic unit tests, and the real
  browser pass above. Coverage headline dropped ~3 points accordingly.
- **No packaging/launcher beyond `pnpm serve`** — documented setup, not a
  double-clickable app. PRODUCT_DECISIONS' launcher requirement remains open.

---

## ADR-037 — Jobs from links: the product's first (and only) outbound fetch

**Date:** 2026-08-17 · **Status:** Accepted

The user went looking for job PDFs to test with and found what every
recruiter finds: postings live at URLs, not in files. `POST
/api/jobs/from-url` accepts a pasted link, fetches it, and hands the bytes
to the exact machinery uploads use.

### The privacy boundary, extended deliberately rather than eroded

"Content never leaves the machine" was, until now, enforced by the absence
of any outbound network code. It is now enforced by bounds, stated in
PRODUCT_DECISIONS and carried on the fetch module's doc comment: the fetch
runs only on an explicit recruiter action; it contacts only the pasted URL;
the request carries nothing from the local store (a disclosed `MatchDesk/1.0`
user-agent, no cookies, no identifiers); the fetched bytes are stored
content-addressed like an upload and face the same refusal gates; nothing is
ever re-fetched in the background. A `source_url` column (migration 0005)
records provenance and is deleted with the row.

**Cross-origin hardening, because this endpoint is different in kind:** a
malicious page could not previously gain anything by CSRF-posting to the
loopback API beyond storing junk locally. An endpoint that makes the machine
ISSUE requests is a blind-SSRF primitive, so it refuses any request whose
`Origin` header is present and not local — browsers always attach `Origin`
to cross-origin POSTs, the UI's same-origin calls pass, and non-browser
clients send none. Verified by test in both directions.

### HTML → text with zero new dependencies

A readability library would drag a dependency tree through the licence gate
(ADR-003/016/033) to solve a problem job postings do not have: they are
text-heavy documents. `htmlExtractor.ts` is a conservative tag-stripper —
script/style/head dropped whole, block tags become line breaks, entities
decoded — whose stated trade is that page boilerplate (nav, cookie banners,
footers) survives into the text. That noise is bounded by the product's own
confirmation step: proposals are chips a person reviews before anything is
scored, so a footer's stray "Java" cannot become a requirement unseen.
Extraction confidence is 0.75 against the document paths' 0.9 for the same
reason. A JavaScript-rendered shell (near-zero markup text) goes to Needs
attention with guidance to use the posting's print/save-as-PDF view — the
SPA analogue of a scanned PDF, refused rather than scored on a nav bar (C7).
Links that serve a PDF directly go through the PDF path unchanged.

### Verified end-to-end, both harness and browser

`apiJobsFromUrl.test.ts` runs the ADR-035 pattern with a second local server
playing the job board (no test fetches a real site — ADR-014): the full
fetch → extract → gate → store → propose → confirm → score → delete chain,
the page-title default (entities decoded), recruiter-title override, the
PDF-link path, the French-page refusal, the SPA refusal with its guidance,
distinct statuses for bad URL / wrong scheme / HTTP error / non-document
type / timeout, the Origin guard in both directions, and non-JSON bodies.
The browser walkthrough drove the same flows through the real UI — including
the destructive leg (H-117's rule) and a schema upgrade of an existing
database by migration 0005.

### Costs, accepted

- **Boilerplate noise in fetched text.** Bounded by human confirmation;
  a trimming pass is a measured future step.
- **JavaScript-rendered postings do not work** and say so with an
  actionable message. Executing pages (a headless browser) is out of all
  proportion to v1.
- **The candidate side is unchanged** — CVs arrive as files, and a
  recruiter pasting a LinkedIn _profile_ link is a different product
  decision nobody has taken.

### ADR-037 amendment (H-120, same day): JSON-LD, recognised boards, and an honest bound

The first three real links failed (H-120). Two extraction realities were
missing and one bound needed widening by exactly one request:

- **schema.org JSON-LD is the primary source when present.** Hosted boards
  embed the posting as `application/ld+json` for job-search SEO; it is the
  posting itself — title, organisation, description — with zero page
  boilerplate, and it now beats markup soup (confidence 0.9 vs 0.75).
- **Recognised-board fallback, path-convention detected.** A shell page
  with no markup text and no JSON-LD may match a known board convention
  (today: `/careers/<id>` → same-host `/careers/<id>/detail`, BambooHR's
  public careers API — detected by PATH because BambooHR white-labels
  custom domains). The board's JSON is re-expressed as a schema.org
  JobPosting document so extraction takes the standard path. Any deviation
  in response shape falls through to the SPA guidance. **The outbound
  bound is therefore amended**: the fetch contacts the pasted URL and — for
  a recognised board whose page carried no text — that same posting's
  public data endpoint on the SAME host, still only on the explicit
  recruiter action. PRODUCT_DECISIONS carries the same amendment.
- **Deployment skew self-reports.** The disk-served UI can outrun the
  running API process; the one error that combination produces on this
  endpoint ("unknown job") now tells the recruiter to restart the server
  rather than presenting a riddle.

Validated against the three real links that failed, not only fixtures; the
fixture corpus gained the shapes that were missing so the class regresses
against tests. Still refused, with guidance: JS-rendered pages with no
JSON-LD and no recognised convention (executing pages remains out of
proportion for v1).

---

## ADR-038 — The inspect view, reverse scoring, and a double-click launcher

**Date:** 2026-08-17 · **Status:** Accepted

Three user requests in one sitting, all of them about the product meeting
people where they are.

**1 · The CV inspect view.** The user's own words after H-116's fix: "no
errors popped up. I do not know whether it worked fully or not." Parse
detail was visible only AFTER scoring. `GET /api/candidates/:id/attributes`
now derives — via the pipeline's own `deriveAttributes`, H-099's
one-derivation rule, never a parallel rendition that could drift — exactly
what evaluation reads, and the candidate page shows it: recognised skills,
counted employment ranges with the tenure total, degrees, certifications,
unreadable sections, each claim highlighted in the document. Gaps are
explained rather than hidden ("tenure written in words is not parsed —
only digits"), because an honest zero the recruiter can see beats a silent
one they discover in a score. Unreadable candidates get the same 409 the
job proposal route uses (C7).

**2 · Reverse scoring.** `POST /api/candidates/:id/score {jobIds}` — one
candidate against the ticked jobs (or all), the mirror of the job page's
button. Same `deriveAttributes` (once per run — the measured 150x
extraction/scoring ratio, roles swapped), same persisted match rows
(ADR-024), same blocking-reservation skip semantics as the batch path
(H-099's lesson: the two directions must not disagree). Unconfigured and
unreadable jobs are reported as skipped with named reasons and shown
disabled in the UI — an unconfirmed job scoring anyone is the H-049
failure, and the checklist says so instead of silently omitting.

**3 · The launcher (PRODUCT_DECISIONS' open requirement, minimal form).**
`start-matchdesk.cmd` (Windows) and `start-matchdesk.command` (macOS):
check Node, `corepack pnpm install` on first run (corepack ships with Node
and reads `packageManager`, so nothing global is installed), start the
server, open the browser. `docs/USER_GUIDE.md` walks a non-technical
recruiter from GitHub's Download ZIP to a running app, and README's top
section points there before anything developer-facing.

**Windows, stated honestly:** verified by audit, not by execution — this
project has no Windows machine. The audit: no `child_process` in product
code, all paths through `node:path`, loopback binding and `homedir()` are
portable, better-sqlite3 ships win32 prebuilds for Node 24, npm scripts use
cmd-compatible `&&`, and corepack honours the pinned `pnpm@11.21.0`. The
first Windows run is the remaining test, and the guide's troubleshooting
table covers the known failure modes (SmartScreen, port in use, blocked
installs, stale-build restarts).

**Costs, accepted:** the candidate-side results link to the job page rather
than the per-pair detail view (that view reads the job-side run cache; a
persisted-match detail route is a later step). The launcher opens the
browser on a timer rather than a readiness probe — a refresh note covers
the cold-build case.

**Amended 2026-08-21 (H-123):** a 13-finding audit of the Windows first-run
flow, prompted by a recruiter's failed first contact, closes the accepted
timer cost above: both launchers now poll `http://127.0.0.1:3900/` with
`curl` and open the browser when the server answers. Only Windows needs a
fallback for a missing `curl.exe` — a fixed wait that leaves instructions on
screen instead of vanishing — because macOS ships `curl`. The "corepack ships
with Node" rationale is decaying upstream — old Nodes ship a broken one, Node
25 removes it — so the launchers prefer corepack, fall back to `npx --yes
pnpm@11.21.0`, and record which one worked. The install gate is now that
written-on-success sentinel rather than the existence of `node_modules`, which
a failed install satisfies forever; on both platforms a sibling file beside
the sentinel records the `pnpm-lock.yaml` signature (size and timestamp),
recomputed AFTER the install and compared for **inequality** on the next
launch — not for age, so a release whose lock file predates the last install
still triggers the refresh — and extracting a new MatchDesk over an old folder
reinstalls instead of trusting stale components. An atomic install marker (a
directory created with `md`/`mkdir`) admits one installer at a time, so a
second double-click during the multi-minute install cannot leave a valid
sentinel over a half-written tree. Both launchers probe port 3900 before
starting and open the browser at an already-running MatchDesk rather than
launching a second server onto a taken port; on Windows that probe needs
`curl.exe` and is skipped without it. Launchers are renamed per platform
(`start-matchdesk-windows.cmd`, `start-matchdesk-mac.command`) and refuse to
run from inside the ZIP. The network-folder refusal is Windows-only: the `\\`
UNC prefix has no macOS equivalent, where the guard is the `cd`-failure branch
instead. Accepted as the next step, with its own ADR to follow: a prebuilt
bundled-Node GitHub Release — the
Node MSI's admin prompt is the one blocker no launcher copy can fix.
