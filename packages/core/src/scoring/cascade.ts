import type { SkillAttribute, SourceSpan } from '../extraction/types.js';
import { relatedTo } from '../taxonomy/lookup.js';
import type { MatchType } from './types.js';

export const EXACT_SUBSCORE = 1.0;
export const ALIAS_SUBSCORE = 0.95;
export const RELATED_SUBSCORE = 0.7;
export const NONE_SUBSCORE = 0;

export interface SkillMatchResult {
  readonly matchType: MatchType;
  readonly subscore: number;
  readonly matchedCanonicalId: string | null;
  readonly evidence: SourceSpan | null;
}

/**
 * Cascade step 4 seam (semantic/embedding matching). Deliberately not
 * implemented here — ADR-011 scopes it out of this slice — but typed so a
 * real implementation can be plugged into `matchSkillRequirement` later
 * without changing this function's contract. `match` returns `null` to mean
 * "no semantic match found", never throws for "not implemented".
 */
export interface SemanticMatcher {
  match(
    requirementCanonicalSkillId: string,
    candidateSkills: readonly SkillAttribute[],
  ): { readonly subscore: number } | null;
}

function isRelated(a: string, b: string): boolean {
  return relatedTo(a).includes(b) || relatedTo(b).includes(a);
}

function earliest(attrs: readonly SkillAttribute[]): SkillAttribute | null {
  if (attrs.length === 0) return null;
  return (
    attrs
      .slice()
      .sort(
        (x, y) => x.sourceSpan.start - y.sourceSpan.start || x.sourceSpan.end - y.sourceSpan.end,
      )[0] ?? null
  );
}

/**
 * The scoring cascade (Section 6.2), steps 1-3, plus the typed step-4 seam:
 *
 *  1. Exact canonical match      -> 1.00 ("exact")
 *  2. Alias match                -> 0.95 ("alias")
 *  3. Taxonomy-related match     -> 0.70 ("related"), checked in BOTH
 *     directions since the taxonomy's `related` links are directed data.
 *  4. Semantic match (optional)  -> whatever `semanticMatcher` returns,
 *     tagged "semantic". Out of scope for this slice; only consulted when
 *     steps 1-3 all fail.
 *  -  No match at all            -> 0, an explicit gap ("none").
 *
 * Ties within a step are broken deterministically by earliest source span.
 */
export function matchSkillRequirement(
  requirementCanonicalSkillId: string,
  candidateSkills: readonly SkillAttribute[],
  semanticMatcher?: SemanticMatcher,
): SkillMatchResult {
  const exactMatches = candidateSkills.filter(
    (a) => a.canonicalId === requirementCanonicalSkillId && a.matchType === 'exact',
  );
  const exact = earliest(exactMatches);
  if (exact !== null) {
    return {
      matchType: 'exact',
      subscore: EXACT_SUBSCORE,
      matchedCanonicalId: exact.canonicalId,
      evidence: exact.sourceSpan,
    };
  }

  const aliasMatches = candidateSkills.filter(
    (a) => a.canonicalId === requirementCanonicalSkillId && a.matchType === 'alias',
  );
  const alias = earliest(aliasMatches);
  if (alias !== null) {
    return {
      matchType: 'alias',
      subscore: ALIAS_SUBSCORE,
      matchedCanonicalId: alias.canonicalId,
      evidence: alias.sourceSpan,
    };
  }

  const relatedMatches = candidateSkills.filter((a) =>
    isRelated(requirementCanonicalSkillId, a.canonicalId),
  );
  const related = earliest(relatedMatches);
  if (related !== null) {
    return {
      matchType: 'related',
      subscore: RELATED_SUBSCORE,
      matchedCanonicalId: related.canonicalId,
      evidence: related.sourceSpan,
    };
  }

  if (semanticMatcher !== undefined) {
    const semantic = semanticMatcher.match(requirementCanonicalSkillId, candidateSkills);
    if (semantic !== null) {
      return {
        matchType: 'semantic',
        subscore: semantic.subscore,
        matchedCanonicalId: null,
        evidence: null,
      };
    }
  }

  return { matchType: 'none', subscore: NONE_SUBSCORE, matchedCanonicalId: null, evidence: null };
}
