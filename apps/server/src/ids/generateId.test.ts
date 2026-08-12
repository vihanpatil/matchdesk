import { describe, expect, it } from 'vitest';

import { generateId } from './generateId.js';

describe('generateId', () => {
  it('returns a 26-character Crockford base32 ULID', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('generates unique values across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });

  it('is strictly increasing across many back-to-back calls, including ones in the same millisecond', () => {
    // Regression: plain ulid() (non-monotonic) generates the random
    // component independently per call, so two calls in the same
    // millisecond are NOT guaranteed to sort in generation order. This is
    // exactly what broke candidateAttributes.test.ts's ordering assertion
    // before generateId switched to monotonicFactory().
    const ids = Array.from({ length: 200 }, () => generateId());
    for (let i = 1; i < ids.length; i++) {
      const previous = ids[i - 1];
      const current = ids[i];
      if (previous === undefined || current === undefined) {
        throw new Error('generateId(): array element unexpectedly undefined');
      }
      expect(current > previous).toBe(true);
    }
  });
});
