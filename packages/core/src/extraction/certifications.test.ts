import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractCertifications } from './certifications.js';

describe('extractCertifications', () => {
  it('finds a recognized certification by its canonical label', () => {
    const text = 'Certified: AWS Certified Solutions Architect (2021).';
    const attrs = extractCertifications(text);
    expect(attrs.some((a) => a.canonicalId === 'aws-saa')).toBe(true);
  });

  it('finds a recognized certification by a known alias/abbreviation', () => {
    const text = 'PMP certified since 2019.';
    const attrs = extractCertifications(text);
    expect(attrs.some((a) => a.canonicalId === 'pmp')).toBe(true);
  });

  it('is case-insensitive', () => {
    const attrs = extractCertifications('cissp holder');
    expect(attrs.some((a) => a.canonicalId === 'cissp')).toBe(true);
  });

  it('does not match a certification abbreviation embedded in an unrelated word', () => {
    const attrs = extractCertifications('The itilization of resources was efficient.');
    expect(attrs.some((a) => a.canonicalId === 'itil')).toBe(false);
  });

  it('every emitted attribute carries a valid, matching span', () => {
    const text = 'PMP, CISSP and Six Sigma Green Belt certified.';
    const attrs = extractCertifications(text);
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('returns an empty array when no certification is mentioned', () => {
    expect(extractCertifications('Enjoys hiking and reading on weekends.')).toEqual([]);
  });

  it('returns an empty array for empty text', () => {
    expect(extractCertifications('')).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const text = 'PMP and AWS Certified Solutions Architect.';
    expect(extractCertifications(text)).toEqual(extractCertifications(text));
  });

  it('does not double-count overlapping mentions, preferring the longer match', () => {
    const text = 'AWS Certified Solutions Architect certification earned in 2021.';
    const attrs = extractCertifications(text);
    const awsMatches = attrs.filter((a) => a.canonicalId === 'aws-saa');
    expect(awsMatches).toHaveLength(1);
  });

  /*
   * VOCABULARY COVERAGE (mutation testing).
   *
   * Mutation testing found the whole `CERTIFICATIONS` table unpinned:
   * deleting a single entry outright (`{}`), or emptying its `aliases`
   * list, survived every prior test. This table decides which credential a
   * candidate is credited with — a silent edit to it changes what a real
   * person is judged to hold, and the recruiter sees only the changed
   * answer.
   *
   * Exhaustive over a FIXED, hand-curated, 12-entry vocabulary. That is not
   * a substitute for a property test; it is coverage of data whose every
   * entry matters individually.
   */
  describe('vocabulary coverage: every certification is found by its canonical label', () => {
    const CANONICAL_LABELS: readonly (readonly [string, string])[] = [
      ['aws-saa', 'AWS Certified Solutions Architect'],
      ['aws-dev-associate', 'AWS Certified Developer Associate'],
      ['pmp', 'Project Management Professional'],
      ['csm', 'Certified ScrumMaster'],
      ['cissp', 'CISSP'],
      ['cpa', 'Certified Public Accountant'],
      ['cfa', 'Chartered Financial Analyst'],
      ['six-sigma', 'Six Sigma'],
      ['itil', 'ITIL'],
      ['comptia-a-plus', 'CompTIA A+'],
      ['azure-admin', 'Microsoft Certified: Azure Administrator'],
      ['gcp-professional', 'Google Cloud Professional'],
    ];

    it.each(CANONICAL_LABELS)('"%s" label resolves to id "%s"', (id, label) => {
      const text = `Holds ${label} certification.`;
      const attrs = extractCertifications(text);
      const match = attrs.find((a) => a.canonicalId === id);
      if (match === undefined) throw new Error(`expected a match for canonical id "${id}"`);
      expect(match.value).toBe(label);
      expect(match.normalizedValue).toBe(id);
      // A canonical-label mention is always an exact match (Section 3): the
      // confidence distinction between a label and an alias mention is a
      // common survivor, so pin the exact constant, not just "high".
      expect(match.confidence).toBe(0.9);
    });
  });

  describe('vocabulary coverage: every alias resolves to its canonical id, at ALIAS_CONFIDENCE', () => {
    // Every entry here is a *genuine* alias term in the gazetteer — i.e. its
    // normalized form differs from both the cert's id and its label. (Four
    // aliases in the table — 'pmp', 'csm', 'cpa', 'cfa' — are literally
    // equal to their own id and are therefore absorbed into the exact-match
    // set at gazetteer-build time; those are covered separately below,
    // because they behave differently: EXACT_CONFIDENCE, not ALIAS_CONFIDENCE.)
    const REAL_ALIASES: readonly (readonly [string, string])[] = [
      ['aws-saa', 'AWS Solutions Architect'],
      ['aws-saa', 'AWS CSA'],
      ['aws-dev-associate', 'AWS Developer Associate'],
      ['csm', 'Certified Scrum Master'],
      ['cissp', 'Certified Information Systems Security Professional'],
      ['six-sigma', 'Six Sigma Black Belt'],
      ['six-sigma', 'Six Sigma Green Belt'],
      ['itil', 'ITIL Foundation'],
      ['azure-admin', 'Azure Administrator'],
      ['azure-admin', 'AZ-104'],
      ['gcp-professional', 'Google Cloud Certified'],
      ['gcp-professional', 'GCP Professional'],
    ];

    it.each(REAL_ALIASES)('alias "%s" resolves to id "%s"', (id, alias) => {
      const text = `Holds ${alias} certification.`;
      const attrs = extractCertifications(text);
      const match = attrs.find((a) => a.canonicalId === id);
      if (match === undefined) throw new Error(`expected a match for canonical id "${id}"`);
      expect(match.value).toBe(alias);
      expect(match.normalizedValue).toBe(id);
      // Pin the exact alias constant (0.75), not merely "lower than exact" —
      // a mutant that swaps which constant is used, or hardcodes either
      // value, must fail here.
      expect(match.confidence).toBe(0.75);
    });
  });

  it('an alias equal to its own id/label ("pmp", "csm", "cpa", "cfa") is matched via the exact term, at EXACT_CONFIDENCE — not ALIAS_CONFIDENCE', () => {
    // For these four certifications the listed alias normalizes to exactly
    // the same string as the id, so the gazetteer-build dedup step
    // (`if (exactSet.has(normalized)) continue;`) drops it as a distinct
    // alias term. The abbreviation is still matched — via the *exact* term
    // built from the id — so it must carry EXACT_CONFIDENCE (0.9), not
    // ALIAS_CONFIDENCE (0.75). A test that only checked "is it found" would
    // miss a mutant that silently downgraded this to alias confidence.
    const cases: readonly (readonly [string, string])[] = [
      ['pmp', 'PMP'],
      ['csm', 'CSM'],
      ['cpa', 'CPA'],
      ['cfa', 'CFA'],
    ];
    for (const [id, text] of cases) {
      const attrs = extractCertifications(`Holds ${text} certification.`);
      const match = attrs.find((a) => a.canonicalId === id);
      if (match === undefined) throw new Error(`expected a match for canonical id "${id}"`);
      expect(match.confidence).toBe(0.9);
    }
  });

  describe('longest-first: overlapping terms prefer the longer match', () => {
    it('prefers the alias "Six Sigma Black Belt" over the shorter, overlapping label "Six Sigma"', () => {
      // "Six Sigma" (the label, 9 chars) is a textual prefix of "Six Sigma
      // Black Belt" (the alias, 21 chars). Both are valid gazetteer terms
      // for the same certification, and they overlap at this exact position
      // in the text. Longest-first must claim the alias's full span first,
      // so the label must NOT also appear as a separate, shorter match.
      const text = 'Certified Six Sigma Black Belt professional.';
      const attrs = extractCertifications(text);
      const sixSigmaMatches = attrs.filter((a) => a.canonicalId === 'six-sigma');
      expect(sixSigmaMatches).toHaveLength(1);
      expect(sixSigmaMatches[0]?.value).toBe('Six Sigma Black Belt');
      expect(sixSigmaMatches[0]?.confidence).toBe(0.75);
      expect(attrs.some((a) => a.value === 'Six Sigma')).toBe(false);
    });

    it('still matches the plain "Six Sigma" label when no longer overlapping alias is present', () => {
      // Control case for the test above: absent the longer alias text,
      // "Six Sigma" alone must still resolve, and as an exact label match.
      const attrs = extractCertifications('Six Sigma certified.');
      const match = attrs.find((a) => a.canonicalId === 'six-sigma');
      if (match === undefined) throw new Error('expected a match for canonical id "six-sigma"');
      expect(match.value).toBe('Six Sigma');
      expect(match.confidence).toBe(0.9);
    });

    it('prefers the full label over the shorter, overlapping alias it contains, while a separate non-overlapping alias mention is still reported', () => {
      // "Azure Administrator" (the alias) is a literal suffix of "Microsoft
      // Certified: Azure Administrator" (the label) — a genuine character-
      // range overlap, not just a conceptual duplicate. The longer label
      // must win that span, and the alias must be suppressed there. "AZ-104"
      // appears elsewhere in the text and does not overlap with the label,
      // so it must still be reported as its own, separate attribute.
      const text = 'Microsoft Certified: Azure Administrator (AZ-104) certified.';
      const attrs = extractCertifications(text);
      const azureMatches = attrs.filter((a) => a.canonicalId === 'azure-admin');
      expect(azureMatches).toHaveLength(2);
      expect(azureMatches.some((a) => a.value === 'Microsoft Certified: Azure Administrator')).toBe(
        true,
      );
      expect(azureMatches.some((a) => a.value === 'AZ-104')).toBe(true);
      // The suppressed shorter alias must never appear on its own.
      expect(attrs.some((a) => a.value === 'Azure Administrator')).toBe(false);
      const label = azureMatches.find(
        (a) => a.value === 'Microsoft Certified: Azure Administrator',
      );
      const abbrev = azureMatches.find((a) => a.value === 'AZ-104');
      if (label === undefined || abbrev === undefined) {
        throw new Error('expected both the label match and the AZ-104 match');
      }
      expect(label.confidence).toBe(0.9);
      expect(abbrev.confidence).toBe(0.75);
    });
  });

  describe('word boundaries', () => {
    it('does not match "pmp" embedded inside a longer word', () => {
      // Both a suffix-embedding ("pmpx") and a prefix-embedding ("scpmp")
      // must be rejected — a one-sided boundary mutant would still pass a
      // naive single-word test.
      const attrs = extractCertifications('pmpx is not a credential, nor is scpmp.');
      expect(attrs.some((a) => a.canonicalId === 'pmp')).toBe(false);
    });

    it('matches "pmp" when adjacent to punctuation and across a newline', () => {
      const commaText = 'Certs: PMP, CISSP.';
      const commaAttrs = extractCertifications(commaText);
      expect(commaAttrs.some((a) => a.canonicalId === 'pmp')).toBe(true);
      expect(commaAttrs.some((a) => a.canonicalId === 'cissp')).toBe(true);

      const newlineText = 'PMP\nCISSP';
      const newlineAttrs = extractCertifications(newlineText);
      expect(newlineAttrs.some((a) => a.canonicalId === 'pmp')).toBe(true);
      expect(newlineAttrs.some((a) => a.canonicalId === 'cissp')).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('matches a multi-word alias written in all caps', () => {
      const attrs = extractCertifications('AWS SOLUTIONS ARCHITECT certified.');
      const match = attrs.find((a) => a.canonicalId === 'aws-saa');
      if (match === undefined) throw new Error('expected a match for canonical id "aws-saa"');
      expect(match.value).toBe('AWS SOLUTIONS ARCHITECT');
    });

    it('matches an id-collision abbreviation written in mixed case', () => {
      const attrs = extractCertifications('PmP certified.');
      const match = attrs.find((a) => a.canonicalId === 'pmp');
      if (match === undefined) throw new Error('expected a match for canonical id "pmp"');
      expect(match.value).toBe('PmP');
    });

    it('matches a multi-word label written in all lowercase', () => {
      const attrs = extractCertifications('chartered financial analyst designation.');
      const match = attrs.find((a) => a.canonicalId === 'cfa');
      if (match === undefined) throw new Error('expected a match for canonical id "cfa"');
      expect(match.value).toBe('chartered financial analyst');
    });
  });

  describe('CompTIA A+ (regex metacharacter escaping)', () => {
    it('matches "CompTIA A+" literally, including the "+"', () => {
      // "+" is a regex quantifier. If the gazetteer term is not escaped
      // before being compiled into a RegExp, "a+" means "one or more a's"
      // instead of a literal plus sign, and the match would stop short of
      // the "+" rather than including it.
      const text = 'CompTIA A+ certified.';
      const attrs = extractCertifications(text);
      const match = attrs.find((a) => a.canonicalId === 'comptia-a-plus');
      if (match === undefined) {
        throw new Error('expected a match for canonical id "comptia-a-plus"');
      }
      expect(match.value).toBe('CompTIA A+');
      expect(text.slice(match.sourceSpan.start, match.sourceSpan.end)).toBe('CompTIA A+');
    });

    it('does not match "CompTIA A" without the trailing "+"', () => {
      // This is the code's specified behaviour, not an accident: every
      // gazetteer surface form for this certification includes the literal
      // "+", so text missing it must not be credited with the certification.
      const attrs = extractCertifications('I have a CompTIA A rating.');
      expect(attrs.some((a) => a.canonicalId === 'comptia-a-plus')).toBe(false);
    });
  });

  it("every emitted attribute's value is the exact source substring its span covers, across several certifications in one document", () => {
    // `assertValidSpan` alone only requires a case-insensitive match; this
    // pins the stronger, case-SENSITIVE invariant the UI relies on to
    // highlight the literal source text.
    const text = 'Certifications: CISSP, PMP, and Six Sigma Green Belt (2022).';
    const attrs = extractCertifications(text);
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(text.slice(attr.sourceSpan.start, attr.sourceSpan.end)).toBe(attr.value);
    }
  });

  it('orders results by position in the source text, not by internal gazetteer processing order', () => {
    // The gazetteer is walked longest-term-first internally (so that
    // "AWS Certified Solutions Architect", the longest term, is matched
    // before the much shorter "CISSP" and "PMP"), which is the OPPOSITE of
    // this text's left-to-right order. The final `found.sort(...)` call is
    // what re-establishes reading order; a broken or removed sort would
    // leave the gazetteer's internal order showing through.
    const text = 'CISSP holder with AWS Certified Solutions Architect and PMP certification.';
    const attrs = extractCertifications(text);
    expect(attrs.map((a) => a.canonicalId)).toEqual(['cissp', 'aws-saa', 'pmp']);
    for (let i = 1; i < attrs.length; i += 1) {
      const prev = attrs[i - 1];
      const curr = attrs[i];
      if (prev === undefined || curr === undefined) throw new Error('unreachable: within bounds');
      expect(curr.sourceSpan.start).toBeGreaterThan(prev.sourceSpan.start);
    }
  });
});
