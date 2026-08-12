import { describe, expect, it } from 'vitest';

import type { SkillAttribute } from '../extraction/types.js';
import { matchSkillRequirement } from './cascade.js';

function skill(
  canonicalId: string,
  matchType: 'exact' | 'alias',
  start = 0,
  end = 10,
): SkillAttribute {
  return {
    kind: 'skill',
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start, end },
    canonicalId,
    matchType,
  };
}

describe('matchSkillRequirement — cascade steps 1-3', () => {
  it('step 1: exact canonical match scores 1.00', () => {
    const result = matchSkillRequirement('postgresql', [skill('postgresql', 'exact')]);
    expect(result.matchType).toBe('exact');
    expect(result.subscore).toBe(1.0);
    expect(result.matchedCanonicalId).toBe('postgresql');
    expect(result.evidence).toEqual({ start: 0, end: 10 });
  });

  it('step 2: alias match scores 0.95', () => {
    const result = matchSkillRequirement('postgresql', [skill('postgresql', 'alias')]);
    expect(result.matchType).toBe('alias');
    expect(result.subscore).toBe(0.95);
  });

  it('exact beats alias when the candidate has both for the same requirement', () => {
    const result = matchSkillRequirement('postgresql', [
      skill('postgresql', 'alias', 20, 30),
      skill('postgresql', 'exact', 0, 10),
    ]);
    expect(result.matchType).toBe('exact');
    expect(result.evidence).toEqual({ start: 0, end: 10 });
  });

  it('step 3: taxonomy-related match scores 0.70', () => {
    // postgresql relates to sql in the taxonomy.
    const result = matchSkillRequirement('postgresql', [skill('sql', 'exact')]);
    expect(result.matchType).toBe('related');
    expect(result.subscore).toBe(0.7);
    expect(result.matchedCanonicalId).toBe('sql');
  });

  it('step 3 is checked in both directions of the related link', () => {
    // In the taxonomy data, react.related includes javascript, but
    // javascript.related does NOT include react — a genuinely asymmetric
    // pair. Requiring "javascript" with only "react" on the candidate must
    // still register as related, proving the check is not one-directional.
    const result = matchSkillRequirement('javascript', [skill('react', 'exact')]);
    expect(result.matchType).toBe('related');
    expect(result.subscore).toBe(0.7);
  });

  it('step 4 (none of the above): scores 0 and records an explicit gap', () => {
    const result = matchSkillRequirement('postgresql', [skill('react', 'exact')]);
    expect(result.matchType).toBe('none');
    expect(result.subscore).toBe(0);
    expect(result.matchedCanonicalId).toBeNull();
    expect(result.evidence).toBeNull();
  });

  it('scores 0 against an empty candidate skill list', () => {
    const result = matchSkillRequirement('postgresql', []);
    expect(result.matchType).toBe('none');
    expect(result.subscore).toBe(0);
  });

  it('picks the earliest-span match deterministically when multiple candidates tie at the same step', () => {
    const result = matchSkillRequirement('postgresql', [
      skill('postgresql', 'exact', 50, 60),
      skill('postgresql', 'exact', 0, 10),
    ]);
    expect(result.evidence).toEqual({ start: 0, end: 10 });
  });

  it('is deterministic across repeated calls', () => {
    const attrs = [skill('sql', 'exact')];
    expect(matchSkillRequirement('postgresql', attrs)).toEqual(
      matchSkillRequirement('postgresql', attrs),
    );
  });
});

describe('matchSkillRequirement — the semantic seam (cascade step 4, out of scope for this slice)', () => {
  it('never invokes the semantic matcher when steps 1-3 already found a match', () => {
    let called = false;
    const result = matchSkillRequirement('postgresql', [skill('postgresql', 'exact')], {
      match: () => {
        called = true;
        return { subscore: 0.5 };
      },
    });
    expect(called).toBe(false);
    expect(result.matchType).toBe('exact');
  });

  it('falls through to the semantic matcher only when steps 1-3 all fail, and tags the result "semantic"', () => {
    const result = matchSkillRequirement('postgresql', [skill('react', 'exact')], {
      match: (requirementId) => (requirementId === 'postgresql' ? { subscore: 0.55 } : null),
    });
    expect(result.matchType).toBe('semantic');
    expect(result.subscore).toBe(0.55);
  });

  it('records an explicit "none" gap when the semantic matcher also returns no match', () => {
    const result = matchSkillRequirement('postgresql', [skill('react', 'exact')], {
      match: () => null,
    });
    expect(result.matchType).toBe('none');
    expect(result.subscore).toBe(0);
  });
});
