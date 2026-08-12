import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';

describe('assertValidSpan', () => {
  const text = 'I know PostgreSQL and Python well.';

  it('does not throw for an in-bounds span', () => {
    expect(() => {
      assertValidSpan(text, { start: 7, end: 17 });
    }).not.toThrow();
  });

  it('does not throw when the span text matches the expected value, case-insensitively', () => {
    expect(() => {
      assertValidSpan(text, { start: 7, end: 17 }, 'PostgreSQL');
    }).not.toThrow();
    expect(() => {
      assertValidSpan(text, { start: 7, end: 17 }, 'postgresql');
    }).not.toThrow();
  });

  it('throws when start is negative', () => {
    expect(() => {
      assertValidSpan(text, { start: -1, end: 5 });
    }).toThrow(/invalid span/i);
  });

  it('throws when end exceeds the text length', () => {
    expect(() => {
      assertValidSpan(text, { start: 0, end: text.length + 1 });
    }).toThrow(/invalid span/i);
  });

  it('throws when start >= end (zero-width or inverted span)', () => {
    expect(() => {
      assertValidSpan(text, { start: 5, end: 5 });
    }).toThrow(/invalid span/i);
    expect(() => {
      assertValidSpan(text, { start: 6, end: 5 });
    }).toThrow(/invalid span/i);
  });

  it('throws when start or end is not an integer', () => {
    expect(() => {
      assertValidSpan(text, { start: 1.5, end: 5 });
    }).toThrow(/integer/i);
    expect(() => {
      assertValidSpan(text, { start: 1, end: 5.5 });
    }).toThrow(/integer/i);
  });

  it('throws when the span text does not match the expected value', () => {
    expect(() => {
      assertValidSpan(text, { start: 7, end: 17 }, 'Python');
    }).toThrow(/span text mismatch/i);
  });

  it('accepts a span at the very end of the text', () => {
    expect(() => {
      assertValidSpan(text, { start: text.length - 5, end: text.length });
    }).not.toThrow();
  });
});
