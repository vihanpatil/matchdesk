import { describe, expect, it } from 'vitest';

import { quantize, roundHalfUp } from './round.js';

describe('roundHalfUp', () => {
  it('rounds to the nearest integer by default', () => {
    expect(roundHalfUp(1.4)).toBe(1);
    expect(roundHalfUp(1.6)).toBe(2);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(7)).toBe(7);
  });

  it('breaks exact ties upward, not to even', () => {
    // Banker's rounding would give 2 here. Section 6.4 specifies half-up.
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(3.5)).toBe(4);
  });

  it('breaks negative ties toward positive infinity', () => {
    expect(roundHalfUp(-0.5)).toBe(0);
    expect(roundHalfUp(-1.5)).toBe(-1);
    expect(roundHalfUp(-2.5)).toBe(-2);
    expect(roundHalfUp(-1.6)).toBe(-2);
  });

  it('rounds decimal ties that binary floating point stores slightly low', () => {
    // The reason this function exists. Math.round(1.005 * 100) / 100 === 1.
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(1.255, 2)).toBe(1.26);
    expect(roundHalfUp(8.575, 2)).toBe(8.58);
  });

  it('honours the requested decimal precision', () => {
    expect(roundHalfUp(3.14159265, 4)).toBe(3.1416);
    expect(roundHalfUp(3.14159265, 0)).toBe(3);
    expect(roundHalfUp(0.123456789, 6)).toBe(0.123457);
    expect(roundHalfUp(1 / 3, 6)).toBe(0.333333);
  });

  it('absorbs representation error from arithmetic', () => {
    expect(roundHalfUp(0.1 + 0.2, 6)).toBe(0.3);
    expect(roundHalfUp(0.1 + 0.2, 15)).toBe(0.3);
  });

  it('is idempotent', () => {
    for (const value of [1.005, 2.675, 1 / 3, 0.1 + 0.2, 99.999999, -4.5]) {
      const once = roundHalfUp(value, 6);
      expect(roundHalfUp(once, 6)).toBe(once);
    }
  });

  it('is deterministic across repeated calls', () => {
    const results = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      results.add(roundHalfUp(0.1 + 0.2, 6));
    }
    expect(results.size).toBe(1);
  });

  it('returns very large magnitudes unchanged rather than corrupting them', () => {
    // Beyond 1e15 there is no fractional part left to round; toPrecision(15)
    // would lose integer digits, so the value passes through untouched.
    expect(roundHalfUp(1e20)).toBe(1e20);
    expect(roundHalfUp(-1e20)).toBe(-1e20);
    expect(roundHalfUp(1e14, 2)).toBe(1e14);
  });

  it('throws on non-finite input instead of returning NaN', () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.NaN)).toThrow(/must be finite/);
  });

  it('throws on an invalid decimals argument', () => {
    expect(() => roundHalfUp(1, -1)).toThrow(RangeError);
    expect(() => roundHalfUp(1, 16)).toThrow(RangeError);
    expect(() => roundHalfUp(1, 1.5)).toThrow(RangeError);
    expect(() => roundHalfUp(1, Number.NaN)).toThrow(/integer in \[0, 15\]/);
  });
});

describe('quantize', () => {
  it('collapses to six decimal places', () => {
    expect(quantize(0.1234564999)).toBe(0.123456);
    expect(quantize(0.1234565)).toBe(0.123457);
    expect(quantize(1)).toBe(1);
  });

  it('erases drift below the engine precision floor', () => {
    // The C-5 mitigation: sub-1e-6 hardware drift must not survive to a score.
    const drifted = 0.75 + 1e-9;
    expect(quantize(drifted)).toBe(quantize(0.75));
    expect(quantize(0.42 - 3e-10)).toBe(0.42);
  });

  it('does not erase differences at or above the precision floor', () => {
    expect(quantize(0.75 + 1e-5)).not.toBe(quantize(0.75));
  });
});
