/**
 * The gate registry: pure logic for computing ADR-023's exit criteria from
 * `docs/findings.json` rather than from a reading of `HONESTY_LOG.md`.
 *
 * WHY THIS IS A SEPARATE MODULE (ADR-028). E5 said "zero open wrong-score
 * entries" while nothing carried a classification, so evaluating it meant a
 * fresh session re-reading 74 narrative entries and forming an opinion.
 * E5 flipped MET -> disputed -> NOT MET and E2 flipped NOT MET -> MET ->
 * NOT MET without the code changing once, while E3 and E4 — the two criteria
 * settled by running something — converged and stayed converged.
 *
 * These functions decide nothing. They count what the registry records.
 * `scripts/gate.mjs` is the I/O shell around them.
 */

/** @typedef {'wrong-score'|'false-refusal'|'coverage-gap'|'integrity'|'process'|'unclassified'} Severity */
/** @typedef {'open'|'closed'} Status */
/** @typedef {{ id: string, severity: Severity, status: Status, note?: string }} Finding */

/** @type {ReadonlySet<string>} */
export const SEVERITIES = new Set([
  'wrong-score',
  'false-refusal',
  'coverage-gap',
  'integrity',
  'process',
  'unclassified',
]);

/** @type {ReadonlySet<string>} */
export const STATUSES = new Set(['open', 'closed']);

/**
 * Every `### H-NNN ·` / `### DN ·` heading in the narrative log.
 *
 * Anchored to the exact heading shape the log uses. A looser match would pull
 * in prose mentions of an id and make the completeness check below vacuous —
 * which is the failure mode this whole file exists to prevent.
 *
 * @param {string} markdown
 * @returns {Set<string>}
 */
export function headingIds(markdown) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const line of markdown.split('\n')) {
    const m = /^###[ \t]+(H-\d+|D\d+)[ \t]*·/.exec(line);
    if (m?.[1] !== undefined) ids.add(m[1]);
  }
  return ids;
}

/**
 * Checks the registry is sound enough to compute a gate from.
 *
 * The completeness check runs in BOTH directions on purpose. H-004 and H-044
 * are both cases of a registry quietly covering less than it appeared to, so a
 * finding present in the narrative but absent here must fail loudly rather
 * than be silently excluded from the gate it feeds.
 *
 * @param {readonly Finding[]} findings
 * @param {ReadonlySet<string>} logIds
 * @returns {string[]} human-readable problems; empty means sound
 */
export function validateRegistry(findings, logIds) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const f of findings) {
    if (!f.id) {
      problems.push(`entry with no id: ${JSON.stringify(f)}`);
      continue;
    }
    if (seen.has(f.id)) problems.push(`${f.id}: listed twice in the registry`);
    seen.add(f.id);
    if (!SEVERITIES.has(f.severity)) problems.push(`${f.id}: bad severity "${String(f.severity)}"`);
    if (!STATUSES.has(f.status)) problems.push(`${f.id}: bad status "${String(f.status)}"`);
    if (f.severity === 'unclassified' && f.note === undefined)
      problems.push(`${f.id}: unclassified entries must carry a note saying why`);
  }

  for (const id of logIds)
    if (!seen.has(id)) problems.push(`${id}: in HONESTY_LOG.md but MISSING from findings.json`);

  for (const f of findings)
    if (f.id && !logIds.has(f.id) && f.note === undefined)
      problems.push(
        `${f.id}: in findings.json, no matching log heading, and no note explaining why`,
      );

  return problems;
}

/**
 * Computes E5 and E2 from the registry.
 *
 * **`unclassified` blocks E5 by design.** A finding nobody has triaged is not
 * evidence of safety; treating it as non-blocking is precisely the assumption
 * H-055 made and H-063 caught. Blocking makes the untriaged set visible and
 * finite instead of letting it accumulate silently.
 *
 * **E2 is derived, not independently tracked.** "Pinned" is defined as a test
 * that fails when the fix is reverted, which is what mutation testing already
 * measures (ADR-028 Decision 2). An OPEN wrong-score finding is by definition
 * unfixed, so it cannot be pinned — E2 therefore cannot pass while E5 fails,
 * and collapsing it here removes one criterion that was decided by opinion.
 *
 * @param {readonly Finding[]} findings
 */
export function computeGate(findings) {
  const open = findings.filter((f) => f.status === 'open');
  const blockingE5 = open.filter(
    (f) => f.severity === 'wrong-score' || f.severity === 'unclassified',
  );
  const e5 = blockingE5.length === 0;

  /** @type {Record<string, number>} */
  const openBySeverity = {};
  for (const f of open) openBySeverity[f.severity] = (openBySeverity[f.severity] ?? 0) + 1;

  return {
    e5,
    e2: e5,
    blockingE5,
    openCount: open.length,
    totalCount: findings.length,
    openBySeverity,
  };
}
