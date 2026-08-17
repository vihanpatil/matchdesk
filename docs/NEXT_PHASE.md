# Next phase — brief for a new session

**Written:** 2026-08-14 (supersedes the earlier 2026-08-14 brief) ·
**Read `docs/SESSION_STATE.md` first, then this.**
**Run `pnpm gate` before believing any status in any document, including this one.**

---

## 0. Start here

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.19.0
cd /Users/vihanpatil/personal/projects/Resume-Match/matchdesk
pnpm gate      # an exit code, not prose
pnpm verify    # ~1 min, must exit 0
```

**Gate at time of writing:** E1 not met (one row), E2 not met (derived from E5),
E3 settled by `pnpm test`, E4 settled by `pnpm mutate`, **E5 NOT MET — ONE
blocker, `H-041`.**

**Do not carry E3/E4 figures forward from here.** Both are settled by running a
command. Quoting a stale figure is trap 3 and this project has done it twice.

**52 commits are unpushed and the user has HELD the push.** An ADR-014 content
scan is clean and on file. Do not push without asking.

---

## 1. What changed, and the one number that matters

**E5 blockers went 3 → 8 → 1 in a single session.** Both moves are the same
fact: the defects were always in the code, and the only variable was whether
anyone looked. Do not read the fall as progress any more than the rise was
decline.

An ADR-015 adversarial round attacked three checklist rows and found **nine**
defects, six of them wrong-score. All are now closed, each with a test that
fails without its fix:

| finding   | what it did                                                              |
| --------- | ------------------------------------------------------------------------ |
| **H-100** | `Education   Leeds, UK` **deleted the section** — 11.6 years → "found 0" |
| **H-099** | the batch path **persisted** the score the single path refuses to write  |
| **H-101** | one future-dated endpoint deleted the whole role                         |
| **H-102** | a metric bullet on the next line deleted a real role                     |
| **H-103** | `"15 year old system"` became **15 years of tenure**                     |
| **H-104** | per-range rounding inflated tenure ~20%                                  |
| **H-095** | `03.2019` reported 7.6 against a truth of 7.4                            |
| **H-106** | `"the van … door to door"` **refused an English CV**                     |
| **H-107** | two concurrent ambiguous ranges asserted "at least 9.8" for ~4.9         |

**A5 had never been run in the project's history.** Its first run produced
H-100, a wrong-score in both directions. **A4 and A5 now read Covered.**

---

## 2. The only blocker left

### H-041 — a sub-floor foreign insert is scored, not refused

**Do not start this without reading H-105 first.** H-041's scope note said the
residual was _Germanic_. That is **false**, and it was false for three sessions:

```
German     SCORED 50/ineligible      Portuguese  REFUSED (correct)
Polish     SCORED 50/ineligible      Spanish     REFUSED (correct)
Turkish    SCORED 50/ineligible
Romanian   SCORED 50/ineligible
Indonesian SCORED 50/ineligible
```

5 of 7 foreign degree lines scored, each telling the recruiter a graduate has no
degree. A second arm scored 7 of 9, Portuguese and Czech included — and
Portuguese flipping between arms is itself the proof that **this is segmentation
geometry, not classifier accuracy.**

**A remedy aimed at "Germanic" would measure none of the languages that
actually fail, and would be declared successful.**

**What is already ruled out, with measurements on file:**

- **Swapping the classifier.** ADR-031 did that. `eld` is in place and is
  strictly better, but at window granularity it is blind to the sub-floor class
  and at line granularity it costs 2/23 real English CVs (H-092, 64
  configurations).
- **Buying the gate with false refusals.** The user rejected this at 17% (H-080)
  and again at 8.7%. Do not revive it as a threshold.
- **Growing the function-word lexicon.** H-106 has just finished removing seven
  entries from it because they refused ordinary English. It is not a
  lexicon-size problem.

**What remains, and nobody has costed it:** the segmentation itself. A trailing
short line never forms a judgeable window under `lineWindows`' forward-growth
rule. That is the defect. **Cost that change before writing any code**, and
measure it against all 23 English CVs, `INDIAN_ENGLISH_CVS` included, plus the
13 non-English ones.

---

## 3. Everything else that is open

None of these blocks E5. All are registered in `docs/findings.json`.

- **H-108** (`coverage-gap`) — a **dateless** `Experience   Team Lead, Acme Corp`
  is still taken for a header. A job-title pair and a location are the same
  shape once no digits are present. No tenure impact: the dated form is
  rejected, and dates drive tenure. Also unhandled: a letter-spaced header
  _with_ trailing matter.
- **H-107's soundness assumption** — the concurrent-ambiguous-range bound holds
  provided a document does not mix date locales _between_ its own ambiguous
  ranges. Not structurally provable; disclosed in the code.
- **Two live licence risk acceptances** (ADR-033) — `dingbat-to-unicode@1.0.1`
  ships to the recruiter with no licence text anywhere. Replacing `mammoth`'s
  dependency is a decision nobody has taken.
- **E2** — needs a metamorphic relation that generates the defect it names.
  R21/R22 landed for date notation; the language axis still has H-070's problem.
- **The fixture builder cannot express a multi-run visual line.**
  `buildFixturePdf` draws one run per line, so **no fixture can hold an H-100
  regression test.** Extending it is the prerequisite for a corpus-level guard.

---

## 4. How to work on this

The tiger-team decomposition works. Two refinements earned this session:

**Partition by directory, then take the derived state away from everyone.**
Conflict-free-by-directory prevents write conflicts but **not** behavioural
coupling — H-098 was a defect that existed only in the seam between two green
scoped runs. This round the fix was to bar every engineer from
`fixtures/corpus/`, because a snapshot is derived state that two of them would
both perturb, and to have the lead regenerate and audit that diff alone. It
worked: the snapshot diff was 23 lines, every one a `years:` value.

**Never let an engineer's own tests be the acceptance criterion.** Two fixes
this round arrived green, with the failing-test-first discipline genuinely
followed, and were **still wrong** (H-109):

- H-103's first form removed the fabrication _and_ ordinary claims like
  `"15 years as a registered nurse"` — moving the wrong number from
  fabricated-high to silently zero.
- H-104's first form fixed the arithmetic and left the recruiter reading
  `"found 11.583333"`.

Both were caught by tracing to **the number a recruiter sees**, not by any unit
test. `"the named defect is gone"` and `"the defect class is gone"` are
different claims.

**Non-negotiables, unchanged:** the ADR-015 verifier did not author the work and
is not told the lead's view · every engineer measures against the corpora named
in their task · no engineer asserts a gate result · a finding is not closed
until a test fails without the fix · forbid subagents from `pnpm verify`,
`pnpm typecheck`, `pnpm test:cov`, `pnpm add` and `pnpm install`, and have the
lead run the full verify once, serialized.

---

## 5. Traps this project keeps falling into

1. **A corpus that lacks the population it will fail on** — H-022, H-079,
   H-086, H-088, and **H-106**, whose "0 false positives in 70 lines" was true
   of those 70 lines and broke on 15 of 17 ordinary sentences in the very
   professions its own comment named. Fifth instance. Name your corpora.
2. **A guard that cannot fire** — H-060, H-070, H-090. Write the test that fails
   first; a behaviour change that leaves the test count unchanged is not pinned.
3. **A figure carried across a change** — H-074, H-058, **H-096**. Quote
   `n/total`; re-run rather than copy forward. The E4 figure in a handoff was
   wrong twice.
4. **A narrowing reported as a closure** — H-078, H-085.
5. **Abstention read as refusal** — ADR-027. Classify by what the _system_ does.
6. **Agreement on a label mistaken for agreement on the facts** — H-094. A
   verifier confirmed the lead's verdict while falsifying the lead's
   description on four counts.
7. **A number measured at the wrong granularity** — H-091. A survey reported
   9/23 CVs falsely refused; all nine were proper-noun-only lines and the system
   never judges a bare line.
8. **A fix that relocates the wrong number instead of removing it** — **new,
   H-109.** Trace every fix to what the recruiter reads before believing it.
