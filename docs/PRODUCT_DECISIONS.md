# MatchDesk v1 Product Decisions

**Status:** Accepted on 2026-08-12  
**Authority:** This is the product-decision source of truth for MatchDesk v1.
Implementation decisions remain append-only in `../DECISIONS.md`; known risks and
verification failures remain append-only in `../HONESTY_LOG.md`.

## Product and privacy boundary

- MatchDesk is a local browser application for an **individual recruiter**.
- The `matchdesk/` monorepo is the product source of truth. The root-level
  `resume-checker*.html` files are historical API/LLM prototypes, not v1
  requirements.
- CVs and job descriptions **never leave the recruiter's machine**. The local
  API binds to loopback only; v1 has no LAN mode, remote sharing, cloud
  processing, or external document-content API.
- V1 supports macOS, Windows, and Linux. It must have documented setup and a
  launcher that opens the local browser app.
- Data persists locally until explicit deletion. Deletion removes original files
  and derived candidate/job data; an append-only local audit record may retain
  only an opaque ID, timestamp, and deletion action—never PII or source text.

## Documents, extraction, and scoring

- V1 accepts text-based PDF and DOCX documents only. Scans, unsupported
  formats, insufficient text, untrusted extraction, non-English content, and
  uncertain language classification go to **Needs attention** and are never
  scored. There is no v1 OCR, manual text correction, or local translation.
- V1 is English-only and must state that limitation plainly in the product.
- **Partly-English documents are refused, not partly scored** (ADR-022). A CV
  that mixes English with another language is sent to **Needs attention** with
  the non-English passage identified, rather than scored on the portion that
  happened to be readable. Detection is best-effort and abstains on very terse
  documents, so this reduces the risk rather than eliminating it — the residual
  gap is tracked in `../HONESTY_LOG.md`.
- Matching is deterministic and evidence-backed. Generative models, semantic
  embeddings, and non-deterministic analysis are not part of the scoring path.
- Every displayed strength, gap, eligibility result, and score contribution must
  link to evidence in the source document where such evidence exists.
- Protected-characteristic proxies remain excluded from scoring: work
  authorization, institution name, graduation year, and equivalent sensitive
  attributes. Unmet supported requirements appear separately from the numerical
  score.
- A recruiter may suppress a bad extracted candidate attribute with a reason.
  The suppression is local, auditable, and triggers a rescore. V1 never lets a
  recruiter add an unanchored candidate qualification.

## Job authoring and matching policy

- The app deterministically proposes source-backed requirements from a job
  description. The recruiter must review and confirm them before scoring.
- Proposed requirements start as **preferred**. Only a recruiter may mark a
  requirement as a must-have.
- Supported dimensions use editable per-job default weights: skills 40%,
  experience 30%, seniority 10%, and education/certifications 20%. Weights must
  be non-negative and are stored with the confirmed job configuration.
- The v1 seniority signal is a clearly caveated proxy derived from years of
  experience, not a measure of responsibility, scope, or leadership. Its low
  default weight prevents it from substantially double-counting tenure.
- A recruiter may add a job-local custom skill. It uses whole-phrase,
  case-insensitive, whitespace-normalized exact matching only—no aliases,
  substring matching, inferred relationships, or semantic similarity.
- Requirements the engine cannot reliably model (for example location, salary,
  clearance, or unsupported qualifications) remain source-backed display-only
  review notes. They never affect a score or automated eligibility result.
- A missed recruiter-confirmed must-have keeps the candidate visible in a
  separate ineligible group, below all eligible candidates, with the unmet
  requirement named.

## V1 workflow and interface

- The defining workflow is a **200 jobs × 200 candidates** match matrix.
- The matrix is a virtualized, filterable grid. Each cell shows the integer
  score plus eligible, ineligible, pending, stale, or needs-attention status.
- Opening a cell presents an evidence-first detail view: score composition,
  strengths, gaps, eligibility reasons, and highlighted job/CV excerpts.
- Changes to a candidate, job, confirmed requirement, suppression, or scoring
  configuration automatically enqueue affected pairs for visible local
  background recomputation. Cached/stale results remain distinguishable until
  refreshed; work must be cancellable.
- Candidate names are extracted locally for display only and must never affect
  scoring. When uncertain, the UI shows the original filename with a review
  flag rather than a silent best guess.
- V1 has no CSV export, PDF export, or external sharing. Review happens inside
  the local application.

## Quality and documentation standard

Every behavioral change requires the following, proportionate to its risk:

- user-facing documentation for changed product behavior;
- an ADR when a durable architectural or policy decision changes;
- unit and integration tests for the affected behavior;
- property or metamorphic tests for scoring and extraction behavior where a
  stable relation can be stated;
- full quality-gate evidence before the change is treated as complete.

The historical promises of "free forever" and "offline after first run" are
**not currently v1 product commitments**. They must not be claimed as release
guarantees or silently relied on in future plans without an explicit new
decision. The privacy boundary above is mandatory.
