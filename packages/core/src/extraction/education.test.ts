import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractEducation } from './education.js';

describe('extractEducation', () => {
  it('detects a bachelor degree level from "Bachelor\'s"', () => {
    const attrs = extractEducation(
      "Bachelor's in Computer Science, University of Springfield, 2015.",
    );
    expect(attrs).toHaveLength(1);
    expect(attrs[0]?.degreeLevel).toBe('bachelor');
  });

  it('detects a master degree level from "M.S."', () => {
    const attrs = extractEducation('M.S. in Data Science, Springfield University.');
    expect(attrs.some((a) => a.degreeLevel === 'master')).toBe(true);
  });

  it('detects a doctorate from "PhD"', () => {
    const attrs = extractEducation('PhD in Electrical Engineering.');
    expect(attrs.some((a) => a.degreeLevel === 'doctorate')).toBe(true);
  });

  it('detects an associate degree', () => {
    const attrs = extractEducation("Associate's Degree in Business Administration.");
    expect(attrs.some((a) => a.degreeLevel === 'associate')).toBe(true);
  });

  it('detects a high school diploma', () => {
    const attrs = extractEducation('High School Diploma.');
    expect(attrs.some((a) => a.degreeLevel === 'high_school')).toBe(true);
  });

  it('extracts a recognized field of study, canonicalized', () => {
    const attrs = extractEducation("Bachelor's in Computer Science.");
    expect(attrs[0]?.field).toBe('computer-science');
  });

  it('sets field to null when no recognized field is stated', () => {
    const attrs = extractEducation('Bachelor of Arts.');
    expect(attrs[0]?.degreeLevel).toBe('bachelor');
    expect(attrs[0]?.field).toBeNull();
  });

  it('NEVER includes an institution name in value, normalizedValue or field (ADR-007)', () => {
    const attrs = extractEducation(
      "Bachelor's in Computer Science, Massachusetts Institute of Technology, 2015.",
    );
    for (const attr of attrs) {
      expect(attr.value.toLowerCase()).not.toContain('massachusetts');
      expect(attr.value.toLowerCase()).not.toContain('institute of technology');
      expect(attr.normalizedValue.toLowerCase()).not.toContain('massachusetts');
      expect(String(attr.field).toLowerCase()).not.toContain('massachusetts');
    }
  });

  it('NEVER extracts a graduation year into any field of the attribute (ADR-007)', () => {
    const attrs = extractEducation(
      "Bachelor's in Computer Science, State University, Graduated 2018.",
    );
    for (const attr of attrs) {
      expect(attr.value).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(attr.normalizedValue).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(String(attr.field)).not.toMatch(/\b(19|20)\d{2}\b/);
    }
  });

  it('does not double-count a shorter degree pattern embedded inside a longer overlapping match', () => {
    // "M.B.A." is claimed whole by the master pattern; "B.A." embedded
    // inside it must not also register as a separate bachelor attribute.
    const attrs = extractEducation('M.B.A. from a top program.');
    expect(attrs).toHaveLength(1);
    expect(attrs[0]?.degreeLevel).toBe('master');
  });

  it('detects multiple degrees mentioned in the same document', () => {
    const text = ["Bachelor's in Computer Science, 2012.", "Master's in Data Science, 2015."].join(
      '\n',
    );
    const attrs = extractEducation(text);
    expect(
      attrs.map((a) => a.degreeLevel).toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual(['bachelor', 'master']);
  });

  it('every emitted attribute carries a valid, matching span', () => {
    const text = "Bachelor's in Computer Science, State University, 2015.";
    const attrs = extractEducation(text);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('is case-insensitive', () => {
    expect(extractEducation('bachelor of science in computer science')[0]?.degreeLevel).toBe(
      'bachelor',
    );
  });

  it('is deterministic across repeated calls', () => {
    const text = "Bachelor's in Computer Science, 2015.";
    expect(extractEducation(text)).toEqual(extractEducation(text));
  });

  it('returns an empty array for empty text', () => {
    expect(extractEducation('')).toEqual([]);
  });

  it('returns an empty array when no degree is mentioned', () => {
    expect(extractEducation('Worked at a bakery for five years.')).toEqual([]);
  });

  describe('British-convention and other degree abbreviations (regression)', () => {
    it('detects "BSc" as bachelor', () => {
      const attrs = extractEducation(
        'Education: BSc Computer Science, Stanford University, graduated 2011',
      );
      expect(attrs).toHaveLength(1);
      expect(attrs[0]?.degreeLevel).toBe('bachelor');
    });

    it('detects "MSc" as master', () => {
      const attrs = extractEducation('MSc Data Science');
      expect(attrs).toHaveLength(1);
      expect(attrs[0]?.degreeLevel).toBe('master');
    });

    it.each(['BSc', 'B.Sc', 'B.Sc.', 'BEng', 'B.Eng', 'BBA', 'BCom', 'LLB', 'BTech', 'B.Tech'])(
      'detects "%s" as bachelor',
      (form) => {
        const attrs = extractEducation(`${form} in Computer Science, State University.`);
        expect(attrs.some((a) => a.degreeLevel === 'bachelor')).toBe(true);
      },
    );

    it.each(['MSc', 'M.Sc', 'M.Sc.', 'MEng', 'M.Eng', 'MBA', 'MPhil', 'LLM', 'MTech'])(
      'detects "%s" as master',
      (form) => {
        const attrs = extractEducation(`${form} in Computer Science, State University.`);
        expect(attrs.some((a) => a.degreeLevel === 'master')).toBe(true);
      },
    );

    it.each(['PhD', 'Ph.D.', 'Ph.D', 'DPhil', 'EdD', 'DSc'])(
      'detects "%s" as doctorate',
      (form) => {
        const attrs = extractEducation(`${form} in Computer Science, State University.`);
        expect(attrs.some((a) => a.degreeLevel === 'doctorate')).toBe(true);
      },
    );

    it.each(['MD', 'JD'])('detects "%s" degree, with degree context, as professional', (form) => {
      const attrs = extractEducation(`Earned a ${form} degree from State University.`);
      expect(attrs.some((a) => a.degreeLevel === 'professional')).toBe(true);
    });

    it.each(['AA', 'AS', 'A.A.', 'A.S.'])(
      'detects "%s" degree, with degree context, as associate',
      (form) => {
        const attrs = extractEducation(`${form} degree, State College.`);
        expect(attrs.some((a) => a.degreeLevel === 'associate')).toBe(true);
      },
    );

    it('detects bare "BS" as bachelor when followed by a stated field', () => {
      const attrs = extractEducation('BS in Computer Science, State University, 2015.');
      expect(attrs.some((a) => a.degreeLevel === 'bachelor')).toBe(true);
    });

    it('detects bare "BA" as bachelor when followed by a stated field', () => {
      const attrs = extractEducation('BA in Psychology from State University.');
      expect(attrs.some((a) => a.degreeLevel === 'bachelor')).toBe(true);
    });

    it('detects bare "MS" as master when followed by a stated field', () => {
      const attrs = extractEducation('MS in Data Science, State University.');
      expect(attrs.some((a) => a.degreeLevel === 'master')).toBe(true);
    });

    it('detects bare "MA" as master when followed by a stated field', () => {
      const attrs = extractEducation('MA in Economics, State University.');
      expect(attrs.some((a) => a.degreeLevel === 'master')).toBe(true);
    });

    it('detects bare "BS" as bachelor when a field follows directly, with no "in"/"of"', () => {
      const attrs = extractEducation('BS Computer Science, State University, 2015.');
      expect(attrs.some((a) => a.degreeLevel === 'bachelor')).toBe(true);
    });

    it('scopes the degree-context guard window to the current line when the ambiguous form sits between other lines', () => {
      const text = 'Header\nBS in Computer Science, more text\nFooter line here.';
      const attrs = extractEducation(text);
      expect(attrs.some((a) => a.degreeLevel === 'bachelor')).toBe(true);
    });
  });

  describe('false-positive guards on ambiguous bare abbreviations', () => {
    it('does not treat "MS" in "Worked at MS Azure" as a degree', () => {
      const attrs = extractEducation('Worked at MS Azure for five years.');
      expect(attrs).toEqual([]);
    });

    it('does not treat "MS" in "MS Office" as a degree', () => {
      const attrs = extractEducation('Proficient in MS Office and email.');
      expect(attrs).toEqual([]);
    });

    it('does not treat "MD" in "Located in Baltimore, MD" as a degree', () => {
      const attrs = extractEducation('Located in Baltimore, MD near the office.');
      expect(attrs).toEqual([]);
    });

    it('does not treat "md" in "README.md" as a degree', () => {
      const attrs = extractEducation('See README.md for setup instructions.');
      expect(attrs).toEqual([]);
    });

    it('does not treat bare "AS" as a degree when it is the ordinary word "as"', () => {
      const attrs = extractEducation('Familiar with tools such as Python and Git.');
      expect(attrs).toEqual([]);
    });

    it('does not treat "Associate" in a job title as a degree', () => {
      const attrs = extractEducation('Associate Software Engineer, Acme Corporation');
      expect(attrs).toEqual([]);
    });

    it('does not treat "Associate" in "Associate Director of Engineering" as a degree', () => {
      const attrs = extractEducation('Associate Director of Engineering, Acme Corporation');
      expect(attrs).toEqual([]);
    });

    it('does not treat "Associate" in a certification level name as a degree', () => {
      const attrs = extractEducation('AWS Certified Solutions Architect - Associate');
      expect(attrs).toEqual([]);
    });

    it('does not treat "Associate" in a second certification level name as a degree', () => {
      const attrs = extractEducation('Microsoft Certified: Azure Administrator Associate');
      expect(attrs).toEqual([]);
    });

    it('does not treat "Bachelor" in "Bachelor Party Coordinator" (job title) as a degree', () => {
      const attrs = extractEducation('Bachelor Party Coordinator, Acme Corporation');
      expect(attrs).toEqual([]);
    });

    it('does not treat "Master" in "Master Data Analyst" (job title) as a degree', () => {
      const attrs = extractEducation('Master Data Analyst, Acme Corporation');
      expect(attrs).toEqual([]);
    });

    it('still detects a bare "Associate" degree with a stated field', () => {
      const attrs = extractEducation('Associate of Arts, State College.');
      expect(attrs.some((a) => a.degreeLevel === 'associate')).toBe(true);
    });

    it('does not treat "BA" in "BA testing" (business-analyst context) as a degree', () => {
      // Documented call: "BA" with no supporting degree context (no "degree"
      // keyword, no recognized field of study) is treated as NOT a degree.
      // This favors avoiding a false positive over catching a bare "BA" used
      // as shorthand for Bachelor of Arts with zero surrounding context -
      // see the education.ts guard comment and the final report for the
      // false-positive/false-negative tradeoff this encodes.
      const attrs = extractEducation('Responsibilities included BA testing and sign-off.');
      expect(attrs).toEqual([]);
    });
  });

  describe('ADR-007 still holds for the newly added abbreviation forms', () => {
    it('extracting "BSc ... graduated 2011" yields degree level and field ONLY, never a year', () => {
      const attrs = extractEducation(
        'Education: BSc Computer Science, Stanford University, graduated 2011',
      );
      for (const attr of attrs) {
        expect(attr.value).not.toMatch(/\b(19|20)\d{2}\b/);
        expect(attr.normalizedValue).not.toMatch(/\b(19|20)\d{2}\b/);
        expect(String(attr.field)).not.toMatch(/\b(19|20)\d{2}\b/);
        expect(attr.value.toLowerCase()).not.toContain('stanford');
        expect(String(attr.field).toLowerCase()).not.toContain('stanford');
      }
    });

    it('every newly matched abbreviation still carries a valid, matching span', () => {
      const text = 'BSc Computer Science, Stanford University, graduated 2011';
      const attrs = extractEducation(text);
      for (const attr of attrs) {
        expect(() => {
          assertValidSpan(text, attr.sourceSpan, attr.value);
        }).not.toThrow();
      }
    });
  });
});
