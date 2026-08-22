# MatchDesk

MatchDesk compares CVs against a job description and shows you a match score
for each person, with the exact words in their CV that produced it. It runs on
your own computer, and nothing you upload ever leaves it.

**If you are a recruiter, start here → [Set up MatchDesk](docs/USER_GUIDE.md).**

## For recruiters — using the app

**You do not need to be technical.**

1. **Open the download page:**
   <https://github.com/vihanpatil/matchdesk/releases/latest>
2. **If you see a file named `MatchDesk-windows-x64.zip` — Setup A.** Download
   it, right-click it → **Extract All…**, and double-click
   **`Start-MatchDesk`**. Nothing to install and no administrator password:
   everything MatchDesk needs is inside that ZIP.
3. **If you don't see that file — Setup B.** And **Mac users** have their own
   steps ("Setup on a Mac" in the guide). Both paths: download the ZIP behind
   the green "Code → Download ZIP" button, install Node.js from nodejs.org,
   then double-click **`start-matchdesk-windows.cmd`** (Windows) — on a Mac,
   right-click **`start-matchdesk-mac.command`** and choose **Open** the
   first time.

[docs/USER_GUIDE.md](docs/USER_GUIDE.md) walks either route step by step, and
also covers day-to-day use, what the scores mean, and fixes for common issues.
Your documents and scores live in a `.matchdesk` folder in your home directory
and never leave your machine.

## For developers

A local-first CV/job matching tool for an individual recruiter. Upload job
descriptions and CVs (PDF/DOCX); see deterministic, evidence-backed match
scores. **No candidate data ever leaves the machine.**

The binding constraint is **C7: never score a document you could not fully
read.** A confident wrong number about a real person is the one failure this
project treats as unacceptable, and the entire process — the gate, the
adversarial rounds, the append-only logs — exists to catch it.

### Quick start (developers)

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0   # macOS/Linux; on Windows install Node 24 and use `corepack pnpm`
pnpm install
pnpm gate      # the release gate, computed from docs/findings.json — an exit code, not prose
pnpm verify    # typecheck + lint + format + licence audit + full test suite (~1 min)
pnpm mutate    # mutation testing (~12 min); ratchet enforced by stryker.config.json
pnpm serve     # the app + API on http://127.0.0.1:3900 (loopback only, ADR-035/036)
```

**Never trust a status number written in a document — including this one.**
`pnpm gate` and `pnpm verify` are the only authorities. Every stale-figure
incident this project has had came from quoting a document instead of running
the command.

### What exists

- `packages/core` — extraction (skills, tenure, education, certifications),
  deterministic scoring, eligibility, explanations. No I/O, no inference
  runtime, enforced by `scripts/core-determinism.test.mjs`.
- `apps/server` — ingestion (PDF/DOCX → text), language detection (`eld`),
  SQLite persistence, the document→score pipeline.
- `fixtures/` — a golden corpus rendered to real PDF/DOCX bytes,
  deterministically, at build time.
- `apps/server/src/http` — the loopback-only API and static host
  (`pnpm serve`): upload, requirement proposal + confirmation, scoring,
  matches, deletion (ADR-035).
- `apps/web` — the UI (ADR-036): vanilla ES modules, zero dependencies, no
  build step. Ranked results, evidence highlighting, needs-attention tray,
  light/dark, ambient motion. Open `pnpm serve`'s URL in a browser.
- `release/Start-MatchDesk.cmd` — the launcher for the bundled Windows
  download (ADR-039), which ships its own Node runtime so the recruiter
  installs nothing. `start-matchdesk-windows.cmd` and
  `start-matchdesk-mac.command` are the from-source launchers (ADR-038).
  All three are quoted verbatim in the user guide's troubleshooting tables;
  changing a message string means updating `docs/USER_GUIDE.md` with it.

### Documentation map

| File                                                   | Role                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md)               | **For recruiters.** Non-technical setup (Windows and Mac), day-to-day use, troubleshooting.                       |
| [docs/SESSION_STATE.md](docs/SESSION_STATE.md)         | **Start here (developers).** Current state and what to do next.                                                   |
| [docs/PRODUCT_DECISIONS.md](docs/PRODUCT_DECISIONS.md) | Product source of truth for v1: scope, privacy boundary, refusal rules.                                           |
| [DECISIONS.md](DECISIONS.md)                           | The ADRs. Append-only. Why the architecture is the way it is.                                                     |
| [HONESTY_LOG.md](HONESTY_LOG.md)                       | Every known weakness, measured not asserted. Append-only.                                                         |
| [docs/findings.json](docs/findings.json)               | The gate registry. `pnpm gate` computes the release gate from this file — changing a gate result requires a diff. |
| [docs/ATTACK_CHECKLIST.md](docs/ATTACK_CHECKLIST.md)   | The adversarial attack classes and their coverage status.                                                         |
| [docs/research/](docs/research/)                       | Preserved measurement evidence behind the language-detection decisions.                                           |

### If you read one thing, read this

**H-040, H-089, H-101, H-102 and H-041 were the same defect under five
different names**: the engine emitting a confident number while silently
discarding something it could not account for. Each was filed under whichever
mechanism someone first noticed — a date format, a rounding rule, a language
detector — and each was closed the same way: by making the engine **more
willing to say it did not know** (a blocking `Reservation` instead of a wrong
number).

H-041 alone cost five sessions, because its _name_ encoded a hypothesis about
its cause — "language detection" — and the hypothesis was wrong. What closed
it was asking what the recruiter is actually shown, and noticing the engine
was asserting a negative it could not support (ADR-034).

If a sixth wrong-score finding appears, look there first: what is the engine
silently discarding, and what sentence is it printing that it has no right to
print?

### Rules that are not negotiable

- A finding is not closed until a test fails without the fix (ADR-028).
- The gate is computed from `docs/findings.json`, never argued from prose.
- No generative model in the scoring path; every number traces to highlighted
  source evidence.
- Quote `n/total`, never a bare percentage; re-run, never copy a figure
  forward.
