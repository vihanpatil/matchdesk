import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { extractAttributes } from './extract.js';
import { assertValidSpan } from './span.js';

const referenceDateArb = fc.record({
  year: fc.integer({ min: 1990, max: 2100 }),
  month: fc.integer({ min: 1, max: 12 }),
});

describe('extraction property tests', () => {
  it('never throws on arbitrary text, however malformed', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), referenceDateArb, (text, referenceDate) => {
        expect(() => extractAttributes(text, { referenceDate })).not.toThrow();
      }),
    );
  });

  it('every emitted attribute carries a span that is genuinely in-bounds and matches its value (Section 6.2 invariant)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), referenceDateArb, (text, referenceDate) => {
        const attributes = extractAttributes(text, { referenceDate });
        for (const attr of attributes) {
          expect(() => {
            assertValidSpan(text, attr.sourceSpan, attr.value);
          }).not.toThrow();
        }
      }),
    );
  });

  it('is deterministic: the same text and reference date always produce the same attributes', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), referenceDateArb, (text, referenceDate) => {
        const first = extractAttributes(text, { referenceDate });
        const second = extractAttributes(text, { referenceDate });
        expect(second).toEqual(first);
      }),
    );
  });

  it('never extracts a plausible-looking graduation year as part of an education attribute (ADR-007)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Bachelor', "Bachelor's", 'Master', 'PhD', 'B.S.', 'M.S.'),
        fc.integer({ min: 1950, max: 2099 }),
        referenceDateArb,
        (degreeWord, year, referenceDate) => {
          const text = `${degreeWord} in Computer Science, Graduated ${String(year)}.`;
          const attributes = extractAttributes(text, { referenceDate });
          for (const attr of attributes) {
            if (attr.kind !== 'education') continue;
            expect(attr.value).not.toContain(String(year));
            expect(attr.normalizedValue).not.toContain(String(year));
          }
        },
      ),
    );
  });

  it('returns an empty array for empty text regardless of reference date', () => {
    fc.assert(
      fc.property(referenceDateArb, (referenceDate) => {
        expect(extractAttributes('', { referenceDate })).toEqual([]);
      }),
    );
  });
});
