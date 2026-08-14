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

/**
 * VOCABULARY COVERAGE (ADR-023 E4 / H-057).
 *
 * Mutation testing found the whole `FIELD_VOCAB` alias table and much of the
 * degree-pattern table unpinned: replacing an alias with `""`, or deleting an
 * alias list outright, survived every test. These tables decide what degree a
 * candidate is credited with and in what field — a silent edit to either
 * changes what a real person is judged to hold, and the recruiter sees only
 * the changed answer.
 *
 * Exhaustive over a FIXED, hand-curated vocabulary. That is not a substitute
 * for a property test (the relations in ../metamorphic cover the behaviour
 * that generalises); it is coverage of data whose every entry matters
 * individually.
 */
describe('field vocabulary maps every alias to its canonical id (H-057)', () => {
  const FIELD_ALIASES: readonly (readonly [string, string])[] = [
    ['computer science', 'computer-science'],
    ['cs', 'computer-science'],
    ['computer engineering', 'computer-science'],
    ['cse', 'computer-science'],
    ['business administration', 'business-administration'],
    ['business', 'business-administration'],
    ['data science', 'data-science'],
    ['electrical engineering', 'electrical-engineering'],
    ['mechanical engineering', 'mechanical-engineering'],
    ['information technology', 'information-technology'],
    ['mathematics', 'mathematics'],
    ['math', 'mathematics'],
    ['economics', 'economics'],
    ['econ', 'economics'],
    ['finance', 'finance'],
    ['marketing', 'marketing'],
    ['psychology', 'psychology'],
    ['biology', 'biology'],
    ['chemistry', 'chemistry'],
    ['physics', 'physics'],
    // International expansion (B.1, H-088's residual) — see the FIELD_VOCAB
    // comment in education.ts for why each of these was judged safe.
    ['electronics and communication', 'electronics-communication'],
    ['electronics & communication', 'electronics-communication'],
    ['electronics and communication engineering', 'electronics-communication'],
    ['electronics & communication engineering', 'electronics-communication'],
    ['ece', 'electronics-communication'],
    ['electrical and electronics', 'electrical-electronics'],
    ['electrical & electronics', 'electrical-electronics'],
    ['electrical and electronics engineering', 'electrical-electronics'],
    ['electrical & electronics engineering', 'electrical-electronics'],
    ['eee', 'electrical-electronics'],
    ['structural engineering', 'structural-engineering'],
    ['civil engineering', 'civil-engineering'],
    ['instrumentation engineering', 'instrumentation-engineering'],
    ['instrumentation and control engineering', 'instrumentation-engineering'],
    ['information science', 'information-science'],
    ['information science and engineering', 'information-science'],
    ['biotechnology', 'biotechnology'],
    ['biotech', 'biotechnology'],
  ];

  it.each(FIELD_ALIASES)('"%s" resolves to the field id "%s"', (alias, expectedId) => {
    const found = extractEducation(`BSc in ${alias}`);
    expect(found[0]?.field).toBe(expectedId);
  });

  it('is case-insensitive about the field name', () => {
    expect(extractEducation('BSc in COMPUTER SCIENCE')[0]?.field).toBe('computer-science');
    expect(extractEducation('BSc in Computer Science')[0]?.field).toBe('computer-science');
  });

  it('reports a null field for a subject outside the controlled vocabulary', () => {
    // The vocabulary is deliberately small (ADR-007 forbids institutions).
    // An unrecognised subject must yield NO field rather than a guess.
    expect(extractEducation('BSc in Underwater Basket Weaving')[0]?.field).toBeNull();
  });
});

describe('degree ladder is reachable at every level (H-057)', () => {
  const LEVEL_EXAMPLES: readonly (readonly [string, string])[] = [
    ['High School Diploma', 'high_school'],
    ['high school', 'high_school'],
    ['Associate of Science in Biology', 'associate'],
    ['BSc Computer Science', 'bachelor'],
    ['BEng', 'bachelor'],
    ['BTech', 'bachelor'],
    ['BCom', 'bachelor'],
    ['BBA', 'bachelor'],
    ['LLB Law', 'bachelor'],
    ['MSc Data Science', 'master'],
    ['MEng', 'master'],
    ['MTech', 'master'],
    ['MBA', 'master'],
    ['MPhil', 'master'],
    ['LLM', 'master'],
    ['PhD Machine Learning', 'doctorate'],
    ['DPhil', 'doctorate'],
    ['EdD', 'doctorate'],
    ['DSc', 'doctorate'],
  ];

  it.each(LEVEL_EXAMPLES)('"%s" is extracted as %s', (text, expectedLevel) => {
    expect(extractEducation(text).map((d) => d.normalizedValue)).toContain(expectedLevel);
  });

  it('"high school" matches with or without the optional "diploma"', () => {
    // The pattern makes " diploma" optional. A mutant deleting the optionality
    // silently stops recognising a bare "High School" — the most common form
    // on a CV that has no further qualification, i.e. exactly the candidates
    // most affected by getting it wrong.
    expect(extractEducation('High School').map((d) => d.normalizedValue)).toEqual(['high_school']);
    expect(extractEducation('High School Diploma').map((d) => d.normalizedValue)).toEqual([
      'high_school',
    ]);
  });

  it('requires whitespace, not any character, between "high school" and "diploma"', () => {
    // Pins `\s+` against a mutation to `\S+`: "high schoolXdiploma" is not a
    // qualification.
    expect(extractEducation('high schoolXdiploma').map((d) => d.normalizedValue)).toEqual([]);
  });

  it('accepts multiple spaces between the degree word and "degree"', () => {
    expect(extractEducation("Associate's  degree").map((d) => d.normalizedValue)).toEqual([
      'associate',
    ]);
  });
});

describe('Indian and Commonwealth qualifications (H-088)', () => {
  const degrees = (text: string) =>
    extractEducation(text).map((a) => `${a.degreeLevel}/${a.field ?? '?'}`);

  // Measured before the fix: B.E., M.E., MCA, BCA and PGDM extracted NOTHING,
  // and a candidate holding one was scored 50 and marked INELIGIBLE with
  // "Requires at least a bachelor degree" — a false statement about someone who
  // holds a bachelor's degree. This recruiter works with Indian clients, so
  // these are a primary case.
  it('extracts B.E. as a bachelor degree', () => {
    expect(degrees('Education\nB.E. in Computer Science, Anna University, 2016')).toEqual([
      'bachelor/computer-science',
    ]);
  });

  it('extracts MCA and BCA', () => {
    expect(degrees('Education\nMCA, Savitribai Phule Pune University, 2019')).toEqual(['master/?']);
    expect(degrees('Education\nBCA, Bangalore University, 2016')).toEqual(['bachelor/?']);
  });

  it('extracts PGDM as a postgraduate qualification', () => {
    // PGDM is India's postgraduate diploma in management, treated as
    // MBA-equivalent by employers. Mapped to `master` on that basis; it is a
    // diploma by name, so this is a judgement recorded rather than obvious.
    expect(degrees('Education\nPGDM in Marketing, XLRI Jamshedpur, 2020')).toEqual([
      'master/marketing',
    ]);
  });

  it('does NOT invent a degree from the ordinary words "be" and "me"', () => {
    // These are far more dangerous than the US bare forms already guarded:
    // "be" and "me" appear in ordinary CV prose constantly. They are in
    // AMBIGUOUS_BARE_FORMS and require corroborating degree context.
    expect(degrees('I was asked to be the lead engineer on the project')).toEqual([]);
    expect(degrees('The team lead asked me to run the migration effort')).toEqual([]);
    expect(degrees('BE')).toEqual([]);
  });

  it('FIXED (B.1): a bare B.E./M.E. in an Indian engineering field is now recognised', () => {
    // Formerly "DOCUMENTED GAP: a bare B.E./M.E. with an unrecognised field is
    // still missed" — it asserted the WRONG behaviour on purpose. The pattern
    // matched, but "be"/"me" need corroborating context, and the only
    // corroboration available was a FIELD_VOCAB hit or the literal word
    // "degree". FIELD_VOCAB was 14 US-skewed entries, so "Electronics and
    // Communication" and "Structural Engineering" — two of the commonest
    // Indian engineering disciplines — did not qualify.
    //
    // The fix was expanding FIELD_VOCAB (B.1), not touching DEGREE_PATTERNS.
    // Flipped per docs/NEXT_PHASE.md §4: this assertion FAILED against the
    // fixed FIELD_VOCAB before this flip (observed: `toEqual([])` received
    // `["bachelor/electronics-communication"]`) — proof the vocabulary
    // change, not a rewritten expectation, is what makes this pass.
    expect(degrees('Education\nBE in Electronics and Communication, Anna University')).toEqual([
      'bachelor/electronics-communication',
    ]);
    expect(degrees('Education\nM.E. in Structural Engineering, IIT Madras, 2019')).toEqual([
      'master/structural-engineering',
    ]);

    // ...and both were already found when the field was already recognised —
    // still true, and still localises the fix to the vocabulary.
    expect(degrees('Education\nBE in Computer Science, Anna University, 2016')).toEqual([
      'bachelor/computer-science',
    ]);
  });
});

describe('international field vocabulary (B.1) — new aliases do not fire on ordinary prose', () => {
  const degrees = (text: string) =>
    extractEducation(text).map((a) => `${a.degreeLevel}/${a.field ?? '?'}`);

  // Every alias below is a real Indian engineering discipline or its
  // standard short form, phrased the way a CV actually states it.
  it.each([
    [
      'BE in Electronics and Communication Engineering, Anna University',
      'electronics-communication',
    ],
    ['BE in Electronics & Communication, VTU', 'electronics-communication'],
    ['B.Tech in ECE, NIT Trichy', 'electronics-communication'],
    ['BE in Electrical and Electronics Engineering, Anna University', 'electrical-electronics'],
    ['B.Tech in EEE, JNTU Hyderabad', 'electrical-electronics'],
    ['BE in Structural Engineering, Anna University', 'structural-engineering'],
    ['BE in Civil Engineering, Anna University', 'civil-engineering'],
    ['BE in Instrumentation Engineering, Anna University', 'instrumentation-engineering'],
    ['B.Tech in Information Science, IIT Bombay', 'information-science'],
    ['BE in Biotechnology, Anna University', 'biotechnology'],
    ['BE in CSE, Anna University', 'computer-science'],
  ])('"%s" resolves field to "%s"', (text, expectedField) => {
    const found = degrees(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(`bachelor/${expectedField}`);
  });

  /**
   * The exact adversarial shape named as dangerous in docs/NEXT_PHASE.md: a
   * bare ordinary-English abbreviation or word sitting where FIELD_VOCAB
   * corroboration is checked. Every case below must extract NOTHING.
   */
  it('does not treat ordinary IT/engineering-adjacent prose as degree corroboration', () => {
    // "IT" collides with routine job-description language. It is
    // deliberately NOT in FIELD_VOCAB as a bare alias — this is the
    // adversarial proof, not merely an absence.
    expect(degrees('Worked with IT support throughout the internship.')).toEqual([]);
    expect(degrees('Responsible for IT procurement across three offices.')).toEqual([]);
    // The exact collision shape that sank bare "it": the bare ambiguous form
    // "as" immediately corroborated by a trailing comma-terminated "IT".
    expect(
      degrees('Other duties included vendor management, such as IT, and general admin support.'),
    ).toEqual([]);

    // Bare "mechanical" / "civil" / "structural" / "instrumentation" are
    // deliberately NOT in FIELD_VOCAB either — only the full "<discipline>
    // Engineering" phrasing is. These sentences are the shape that sank
    // them: an ambiguous bare form ("me"/"be") with a bare discipline word,
    // comma-terminated, somewhere in the same 80-character window.
    expect(
      degrees(
        'The team lead asked me to gain experience in instrumentation, monitoring and alerting.',
      ),
    ).toEqual([]);
    expect(
      degrees(
        'I was asked to be the point of contact for issues in mechanical, then moved to firmware.',
      ),
    ).toEqual([]);
    expect(
      degrees('The client asked me to focus on structural, then later on the electrical scope.'),
    ).toEqual([]);
    expect(
      degrees('I was asked to be involved in civil, primarily for the site inspections.'),
    ).toEqual([]);
  });

  it('does not treat "ECE"/"EEE"/"CSE" in non-degree prose as degree corroboration', () => {
    // These abbreviations were kept because they do not collide with
    // ordinary English the way "IT" does. Confirmed here: even placed right
    // where FIELD_VOCAB corroboration is checked, on their own they still
    // require an actual degree-shaped match to produce anything, and bare
    // "be"/"me" prose stays empty.
    expect(degrees('I was asked to be the ECE lab coordinator for the semester.')).toEqual([]);
    expect(degrees('The manager asked me to help EEE-related vendors with onboarding.')).toEqual(
      [],
    );
    expect(degrees('I was asked to be a mentor for CSE freshers this year.')).toEqual([]);
  });
});
