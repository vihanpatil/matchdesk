/**
 * Pure ranking/grouping for score results (ADR-036). Kept DOM-free so it is
 * unit-testable in node.
 *
 * The eligible/ineligible partition is STRUCTURAL (ADR-007/ADR-017): an
 * ineligible candidate can never appear above an eligible one, whatever the
 * scores. Within each group: score descending, then candidateId ascending as
 * a deterministic tie-break (C4 — two runs must render identically).
 */

/**
 * @template {{ candidateId: string, result: { score: number, eligibility: { eligible: boolean } } }} T
 * @param {readonly T[]} scored
 * @returns {{ eligible: T[], ineligible: T[] }}
 */
export function rankResults(scored) {
  /** @param {T} a @param {T} b */
  const byScore = (a, b) =>
    b.result.score - a.result.score || (a.candidateId < b.candidateId ? -1 : 1);
  return {
    eligible: scored.filter((s) => s.result.eligibility.eligible).sort(byScore),
    ineligible: scored.filter((s) => !s.result.eligibility.eligible).sort(byScore),
  };
}
