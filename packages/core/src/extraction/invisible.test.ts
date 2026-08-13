import { describe, expect, it } from 'vitest';

import { extractEducation, extractSkills } from '../index.js';
import { assertValidSpan } from './span.js';
import {
  hasInvisibleCharacters,
  stripInvisibleCharacters,
  withoutInvisibleCharacters,
} from './invisible.js';

const ZWSP = '​';
const SOFT_HYPHEN = '­';
const BOM = '﻿';

describe('stripInvisibleCharacters', () => {
  it('leaves text with no invisible characters exactly as it was', () => {
    const text = 'Skills: JavaScript, Python';
    expect(stripInvisibleCharacters(text).text).toBe(text);
    expect(hasInvisibleCharacters(text)).toBe(false);
  });

  it('removes invisible characters from the cleaned text', () => {
    expect(stripInvisibleCharacters(`Java${ZWSP}Script`).text).toBe('JavaScript');
    expect(withoutInvisibleCharacters(`${BOM}Java${SOFT_HYPHEN}Script`)).toBe('JavaScript');
  });

  it('maps a cleaned span back to the original characters it came from', () => {
    const original = `Java${ZWSP}Script is here`;
    const cleaned = stripInvisibleCharacters(original);

    // "JavaScript" is [0,10) in the cleaned text.
    const start = cleaned.mapStart(0);
    const end = cleaned.mapEnd(10);

    expect(cleaned.text.slice(0, 10)).toBe('JavaScript');
    // The original span covers the invisible character too — that is correct:
    // highlighting must cover the real region of the real document.
    expect(original.slice(start, end)).toBe(`Java${ZWSP}Script`);
  });

  it('does not sweep a trailing invisible character into the span', () => {
    const original = `Python${ZWSP} and more`;
    const cleaned = stripInvisibleCharacters(original);
    const end = cleaned.mapEnd(6); // end of "Python" in cleaned text

    expect(original.slice(cleaned.mapStart(0), end)).toBe('Python');
  });
});

describe('extraction is blind to invisible characters (H-034)', () => {
  it('finds the same skill whether or not a zero-width space splits the word', () => {
    expect(extractSkills(`Skills: Java${ZWSP}Script`).map((s) => s.normalizedValue)).toEqual(
      extractSkills('Skills: JavaScript').map((s) => s.normalizedValue),
    );
  });

  it('no longer fabricates the skill "r" from inside the word "Engineer"', () => {
    // The measured defect: "Software Enginee<ZWSP>r" yielded skill `r`, with
    // the letter sliced out of "Engineer" shown as the evidence. This is
    // H-028 D3 (the "Rémi" -> skill `r` defect) by a different route.
    expect(extractSkills(`Software Enginee${ZWSP}r`).map((s) => s.normalizedValue)).toEqual([]);
  });

  it('does not turn one skill into a different skill', () => {
    // Worse than losing the match: "Java<ZWSP>Script" extracted `java`, so
    // the candidate was credited with a language they may not have.
    expect(extractSkills(`Skills: Java${ZWSP}Script`).map((s) => s.normalizedValue)).toEqual([
      'javascript',
    ]);
  });

  it('still finds a degree split by a soft hyphen', () => {
    expect(extractEducation(`Bach${SOFT_HYPHEN}elor of Science`).length).toBeGreaterThan(0);
  });

  it('returns spans that remain valid against the ORIGINAL polluted text', () => {
    // The whole point of mapping rather than cleaning in place: evidence
    // highlighting indexes the document as stored.
    const original = `Skills: Java${ZWSP}Script, Py${ZWSP}thon`;
    for (const skill of extractSkills(original)) {
      expect(() => {
        assertValidSpan(original, skill.sourceSpan, skill.value);
      }).not.toThrow();
    }
  });

  it('is unaffected by a byte-order mark at the head of the document', () => {
    expect(extractSkills(`${BOM}Skills: Python`).map((s) => s.normalizedValue)).toEqual(
      extractSkills('Skills: Python').map((s) => s.normalizedValue),
    );
  });
});

describe('the lowercase word "as" is not an associate degree (H-033)', () => {
  it('does not read "such as Mathematics" as a degree', () => {
    // Measured defect: this yielded `associate`, with the word "as"
    // highlighted as the evidence for the qualification.
    expect(extractEducation('such as Mathematics').map((d) => d.normalizedValue)).toEqual([]);
    expect(
      extractEducation('Tutored students in subjects such as Mathematics.').map(
        (d) => d.normalizedValue,
      ),
    ).toEqual([]);
  });

  it('still reads a capitalised "AS in Computer Science" as an associate degree', () => {
    expect(extractEducation('AS in Computer Science').map((d) => d.normalizedValue)).toEqual([
      'associate',
    ]);
  });

  it('still reads other capitalised ambiguous abbreviations with real context', () => {
    expect(extractEducation('BS in Computer Science').map((d) => d.normalizedValue)).toEqual([
      'bachelor',
    ]);
    expect(extractEducation('MS in Data Science').map((d) => d.normalizedValue)).toEqual([
      'master',
    ]);
  });
});
