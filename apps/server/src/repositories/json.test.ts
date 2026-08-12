import { describe, expect, it } from 'vitest';

import { parseWarnings, serializeWarnings } from './json.js';

describe('serializeWarnings / parseWarnings', () => {
  it('round-trips an array of strings through JSON', () => {
    const warnings = ['first warning', 'second warning'];
    expect(parseWarnings(serializeWarnings(warnings))).toEqual(warnings);
  });

  it('round-trips an empty array', () => {
    expect(parseWarnings(serializeWarnings([]))).toEqual([]);
  });

  it('rejects malformed JSON rather than silently returning an empty array', () => {
    expect(() => parseWarnings('not json')).toThrow();
  });

  it('rejects valid JSON that is not an array of strings', () => {
    expect(() => parseWarnings('{"a":1}')).toThrow();
    expect(() => parseWarnings('[1,2,3]')).toThrow();
  });
});
