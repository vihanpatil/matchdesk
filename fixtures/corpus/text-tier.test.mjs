import { detectSections, extractAttributes, totalYearsExperience } from '@matchdesk/core';
import { describe, expect, it } from 'vitest';

import { CORPUS, CORPUS_REFERENCE_DATE } from './definitions.mjs';

/**
 * The Section 9.2 fixture corpus — TEXT TIER (ADR-023 E3).
 *
 * Feeds each fixture's lines straight into `packages/core`, bypassing
 * ingestion. Fast, and a failure localises to one extraction rule rather than
 * to "something in the pipeline". The binary tier covers what this cannot
 * reach: PDF/DOCX readers, scan detection and the language gates.
 *
 * **Two kinds of assertion per fixture, deliberately.**
 *
 * 1. **Targeted claims** — what this fixture's defect class is actually about,
 *    written from what is CORRECT rather than from what the engine currently
 *    prints. An expectation copied from observed output tests only that the
 *    code has not changed; it cannot tell you the code was ever right.
 * 2. **A full snapshot** — every attribute, with spans. Targeted claims only
 *    check what someone thought to check. A snapshot catches the system-wide
 *    silent drift that neither targeted assertions nor metamorphic relations
 *    can see, because relations compare two runs that both moved.
 *
 * **If a snapshot fails, that is a question, not a chore.** Update it only
 * after stating why the new value is correct (`docs/SESSION_STATE.md` §7). The
 * `why` field on every fixture exists so that question can be answered years
 * from now.
 *
 * @typedef {import('@matchdesk/core').ExtractedAttribute} ExtractedAttribute
 */

/** @param {string} id */
function fixture(id) {
  const found = CORPUS.find((f) => f.id === id);
  if (found === undefined) throw new Error(`no fixture "${id}" in the corpus`);
  return found;
}

/** @param {string} id @returns {readonly ExtractedAttribute[]} */
function attributesOf(id) {
  return extractAttributes(fixture(id).lines.join('\n'), {
    referenceDate: CORPUS_REFERENCE_DATE,
  });
}

/**
 * Canonical skill ids, sorted, so assertions never depend on emission order.
 *
 * `flatMap` rather than `filter` because it narrows the union properly —
 * lint bans `as` narrowing, and a cast here would have hidden the fact that
 * these are typed attributes rather than loose records.
 *
 * @param {readonly ExtractedAttribute[]} attrs
 */
function skillIds(attrs) {
  return attrs.flatMap((a) => (a.kind === 'skill' ? [a.canonicalId] : [])).sort();
}

/** @param {readonly ExtractedAttribute[]} attrs */
function educationOf(attrs) {
  return attrs.flatMap((a) => (a.kind === 'education' ? [a] : []));
}

/** @param {readonly ExtractedAttribute[]} attrs */
function certificationsOf(attrs) {
  return attrs.flatMap((a) => (a.kind === 'certification' ? [a] : []));
}

/**
 * A stable, readable serialisation for snapshots.
 *
 * Spans are recorded as offsets AND as the text they cover, and both are
 * load-bearing. The quoted text is what makes the snapshot reviewable — a pair
 * of integers tells a human nothing. The offsets are what make it SOUND: this
 * corpus contains documents where the same word appears more than once, so a
 * span that slid from one occurrence to another would produce identical quoted
 * text and pass silently. That is exactly the H-028 D4 shape, an in-bounds span
 * pointing at the wrong place.
 *
 * The first version of this function serialised only the text, under a comment
 * claiming spans were included. They were not.
 *
 * @param {readonly ExtractedAttribute[]} attrs
 * @param {string} text
 */
function snapshotOf(attrs, text) {
  return attrs.map((a) => {
    const common = {
      kind: a.kind,
      normalized: a.normalizedValue,
      span: `${String(a.sourceSpan.start)}..${String(a.sourceSpan.end)}`,
      evidence: text.slice(a.sourceSpan.start, a.sourceSpan.end),
    };

    switch (a.kind) {
      case 'skill':
        return { ...common, canonicalId: a.canonicalId, matchType: a.matchType };
      case 'education':
        return { ...common, degreeLevel: a.degreeLevel, field: a.field };
      case 'certification':
        return { ...common, canonicalId: a.canonicalId };
      case 'years_experience':
        return {
          ...common,
          years: a.years,
          isExplicitStatement: a.isExplicitStatement ?? false,
        };
    }
  });
}

describe('corpus · text tier · targeted claims', () => {
  it('d1 · an unrecognised header does not swallow the employment beneath it', () => {
    const attrs = attributesOf('d1-unrecognised-section-header');
    const text = fixture('d1-unrecognised-section-header').lines.join('\n');

    expect(detectSections(text).map((s) => s.name)).toContain('experience');
    // Two roles spanning Mar 2016 - Present. If one section swallowed the
    // other, tenure collapses to a single role's worth.
    expect(totalYearsExperience(attrs)).toBeGreaterThan(9);
  });

  it('d2 · "Ruby on Rails" yields the framework AND the language', () => {
    const ids = skillIds(attributesOf('d2-longest-match-does-not-swallow'));
    expect(ids).toContain('rails');
    expect(ids).toContain('ruby');
  });

  it('d3 · a name never manufactures a skill', () => {
    const ids = skillIds(attributesOf('d3-name-never-manufactures-a-skill'));
    // "Rémi", "R&D", "Go-to-market" and "C'est" each produced a spurious exact
    // match for a single-letter taxonomy entry. These are the claims that matter.
    expect(ids).not.toContain('r');
    expect(ids).not.toContain('go');
    expect(ids).not.toContain('c');

    // EXACT set, not merely "none of the phantoms". `stakeholder-management`
    // is genuinely written in the document and is a real taxonomy entry
    // (`taxonomy/data.ts`), so extracting it is correct.
    //
    // This assertion originally read `toEqual([])` on the reasoning that the
    // document "names no technology". That was wrong about the FIXTURE, not
    // about the engine — the CV says "stakeholder management" in plain words.
    // Corrected to the exact expected set rather than loosened, because an
    // exact set is strictly stronger: any newly fabricated skill fails here,
    // including one nobody thought to name in a `not.toContain`.
    expect(ids).toEqual(['stakeholder-management']);
  });

  it('d4a · a job title never produces a degree', () => {
    expect(educationOf(attributesOf('d4a-job-title-is-not-a-degree'))).toEqual([]);
  });

  it('d4b · a certification level name never produces a degree', () => {
    const attrs = attributesOf('d4b-certification-level-is-not-a-degree');
    expect(educationOf(attrs)).toEqual([]);
    // The credential itself is real and must still be found — the fix must not
    // have been "stop reading this line".
    expect(certificationsOf(attrs).length).toBeGreaterThan(0);
  });

  it('d4c · ordinary prose never produces a degree', () => {
    expect(educationOf(attributesOf('d4c-prose-is-not-a-degree'))).toEqual([]);
  });

  it('d5 · education dates are not employment', () => {
    const attrs = attributesOf('d5-education-dates-are-not-employment');
    // Only Jan 2024 - Aug 2026 counts. The schooling spans 2012-2018; if it
    // leaked in, tenure would exceed a decade.
    expect(totalYearsExperience(attrs)).toBeLessThan(4);
  });

  it('d5b · an explicit claim is not summed with the ranges describing it', () => {
    const attrs = attributesOf('d5b-explicit-claim-not-summed-with-ranges');
    // The claim says 10; the range Jan 2016 - Jan 2026 is also 10. Summing
    // gives 20 — the H-028 D5b doubling.
    expect(totalYearsExperience(attrs)).toBeLessThanOrEqual(10.5);
  });

  it('d5c · a quantity that looks like a year range adds no tenure', () => {
    const attrs = attributesOf('d5c-quantity-is-not-a-date-range');
    // Only Jan 2023 - Aug 2026 is employment. "2000 - 2024" would add 24 years.
    expect(totalYearsExperience(attrs)).toBeLessThan(4.5);
  });

  it('h034 · invisible characters fabricate nothing', () => {
    const ids = skillIds(attributesOf('h034-invisible-characters-fabricate-nothing'));
    // The precise failure: JavaScript became java, a false claim about a person.
    expect(ids).not.toContain('java');
    expect(ids).toContain('javascript');
    expect(ids).toContain('postgresql');
    expect(ids).toContain('docker');
  });

  it('h040 · overlapping roles are one span of calendar time', () => {
    const attrs = attributesOf('h040-overlapping-roles-not-double-counted');
    // Jan 2020 - Jan 2026 is six years. Three overlapping roles summed naively
    // would give roughly thirteen.
    expect(totalYearsExperience(attrs)).toBeLessThanOrEqual(6.1);
  });

  /**
   * The one assertion in this file that pins behaviour known to be WRONG.
   *
   * Written as an explicit statement of the defect rather than a passing test
   * that conceals one. ADR-023's split turns on whether a finding can change a
   * number: it cannot today, because the gazetteer has no Professional id for
   * a job to require. That is the entire argument, and it is fragile by
   * design — add a level-bearing id and this becomes wrong-score.
   */
  it('GAP · certification level variants collapse to the Associate id (H-028 D8)', () => {
    const certs = certificationsOf(attributesOf('gap-certification-level-variants-collapse'));
    expect(certs).toHaveLength(1);

    const first = certs[0];
    if (first === undefined) throw new Error('expected one certification');
    // A "Professional" credential, reported as the ASSOCIATE id. Asserted so
    // it cannot be lost, not so it can be accepted.
    expect(first.canonicalId).toBe('aws-saa');
    expect(first.value).toBe('AWS Certified Solutions Architect');
  });

  it('baseline · the ordinary case stays ordinary', () => {
    const attrs = attributesOf('baseline-clean-cv');
    const ids = skillIds(attrs);

    expect(ids).toContain('typescript');
    expect(ids).toContain('python');
    expect(ids).toContain('postgresql');
    expect(ids).toContain('docker');
    expect(ids).toContain('aws');

    const education = educationOf(attrs);
    expect(education).toHaveLength(1);
    expect(education[0]?.degreeLevel).toBe('bachelor');

    // Jun 2017 - Aug 2026 with a gap; comfortably under the calendar span.
    expect(totalYearsExperience(attrs)).toBeGreaterThan(8);
    expect(totalYearsExperience(attrs)).toBeLessThanOrEqual(9.2);
  });
});

describe('corpus · text tier · full snapshots', () => {
  for (const entry of CORPUS) {
    it(`${entry.id} · extraction is unchanged`, () => {
      const text = entry.lines.join('\n');
      const attrs = extractAttributes(text, { referenceDate: CORPUS_REFERENCE_DATE });
      expect(snapshotOf(attrs, text)).toMatchSnapshot();
    });
  }
});
