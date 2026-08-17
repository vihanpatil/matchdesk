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
As of this commit they were measured: E3 settled by `pnpm test` (1005 tests),
E4 **80.02%** in 12m01s with no module below 60 — **both MET**. Re-run them
rather than trusting these two sentences.

**52 commits are unpushed and the user has HELD the push.** An ADR-014 content
scan is clean and on file. Do not push without asking.

---

## 1. E5 is MET

```
E1  every ATTACK_CHECKLIST row Covered   E4  run `pnpm mutate`
E2  MET   every wrong-score pinned       E5  MET   zero open wrong-score
E3  run `pnpm test`
```

**Run `pnpm gate` rather than trusting that block.** E3 and E4 are settled by
running a command; quoting a stale figure is trap 3 and this project has done it
twice.

**H-041 closed after five sessions, and how matters more than that it did.** It
was named a language-detection defect, and three sessions went into detecting
the foreign line better — a prose gate, a compounding signal, a function-word
lexicon, a mean-word-length threshold, an institution exemption, a whole
classifier swap to `eld`, and a 40-point threshold grid. Each narrowed it. None
closed it.

**H-112 settled why, by measurement: a person's name is foreign text.**
`"Nguyen Thi Minh Anh"` scores Vietnamese 0.834 with English 0.000 — a stronger
foreign signal than any genuine foreign line. Every evidence floor low enough to
catch a short foreign degree line also refuses candidates in proportion to how
non-Anglo their name is, and four of the names it refuses come from this
project's own `INDIAN_CV_CORPUS`.

**The defect was one sentence the engine had no right to say.** `"Requires at
least a bachelor degree"`, printed when it had extracted no education at all —
a claim about a person, made from silence, while holding text it could not read.
**ADR-034** makes it decline to assert a must-have unmet in that situation.
Zero cost across 50 documents; nine languages caught in native orthography.

**The pattern, because it has now closed five findings under five different
names.** H-040, H-089, H-101, H-102 and H-041 were all the same defect: the
engine emitting a confident number while silently discarding something it could
not account for. Each was filed under the mechanism someone first noticed, and
each was closed by making the engine **more willing to say it did not know**.
If a sixth appears, look there first.

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
- **`experience.ts` is the weakest module in the engine at 69.36% mutation
  score, and it DECLINED this session** (was 71.04%) — see **H-110**. E4 still
  passes on both criteria, which is precisely why this is easy to miss: the
  ratchet watches only the aggregate, and the aggregate is carried by files
  that are easy to test. This is the file that computes tenure and the file
  every wrong-score finding here has ultimately been about. **A session aiming
  to raise E4 should start here and nowhere else** — but note it means writing
  tests against surviving mutants rather than against defects, which is a
  different and larger activity.
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
