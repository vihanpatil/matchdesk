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

**Date:** 2026-08-12 · **Status:** Accepted

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

**Date:** 2026-08-12 · **Status:** Accepted

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

**Date:** 2026-08-12 · **Status:** Accepted

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
