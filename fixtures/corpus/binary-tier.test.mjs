import { extractAttributes, totalYearsExperience } from '@matchdesk/core';
import { describe, expect, it } from 'vitest';

// Relative, because `@matchdesk/server` is a private app with no exports map —
// it is not a library and should not become one just to be tested from here.
import { extractText } from '../../apps/server/src/ingestion/extractText.js';
import {
  detectLanguageHeuristic,
  findNonEnglishSegments,
} from '../../apps/server/src/ingestion/languageDetection.js';

import { buildFixtureDocx, buildFixturePdf } from '../../scripts/lib/fixture-docs.mjs';
import { CORPUS, CORPUS_REFERENCE_DATE, INDIAN_CV_CORPUS, REFUSAL_CORPUS } from './definitions.mjs';

/**
 * The Section 9.2 fixture corpus — BINARY TIER (ADR-023 E3).
 *
 * Renders fixture definitions to real PDF and DOCX bytes and pushes them
 * through the actual ingestion path. **This is the only tier that can fail the
 * way the worst defects failed.** The text tier hands a string to
 * `extractAttributes` and therefore cannot reach scan detection, the Cavnar &
 * Trenkle language classifier, or the ADR-022 mixed-language veto — all of
 * which live in `apps/server/src/ingestion` and only ever see bytes in a
 * container. H-028 D6, where a French CV classified as more English than an
 * English one, was invisible to everything except a test shaped like this.
 *
 * @typedef {import('./definitions.mjs').Fixture} Fixture
 */

/** @param {string} id */
function fixture(id) {
  const found = [...CORPUS, ...INDIAN_CV_CORPUS].find((f) => f.id === id);
  if (found === undefined) throw new Error(`no fixture "${id}" in the corpus`);
  return found;
}

describe('corpus · binary tier · a document becomes a score', () => {
  it('a clean CV survives the whole PDF path', async () => {
    const entry = fixture('baseline-clean-cv');
    const result = await extractText(await buildFixturePdf(entry), 'baseline.pdf');

    expect(result.parseStatus).toBe('ok');
    expect(result.language).toBe('en');
    expect(result.reason).toBeNull();

    const attrs = extractAttributes(result.text, { referenceDate: CORPUS_REFERENCE_DATE });
    const skills = attrs.flatMap((a) => (a.kind === 'skill' ? [a.canonicalId] : []));
    expect(skills).toContain('typescript');
    expect(skills).toContain('postgresql');
    expect(totalYearsExperience(attrs)).toBeGreaterThan(8);
  });

  it('a clean CV survives the whole DOCX path', async () => {
    const entry = fixture('baseline-clean-cv');
    const result = await extractText(await buildFixtureDocx(entry), 'baseline.docx');

    expect(result.parseStatus).toBe('ok');
    expect(result.language).toBe('en');

    const attrs = extractAttributes(result.text, { referenceDate: CORPUS_REFERENCE_DATE });
    const skills = attrs.flatMap((a) => (a.kind === 'skill' ? [a.canonicalId] : []));
    expect(skills).toContain('typescript');
    expect(skills).toContain('postgresql');
    expect(totalYearsExperience(attrs)).toBeGreaterThan(8);
  });

  /**
   * The defect that motivated the binary tier, end to end: invisible
   * characters survive PDF and DOCX encoding and must still not fabricate a
   * credential. `java` instead of `javascript` is a false claim about a person,
   * not merely a miss.
   */
  it('invisible characters fabricate nothing through a real container', async () => {
    const entry = fixture('h034-invisible-characters-fabricate-nothing');
    const result = await extractText(await buildFixtureDocx(entry), 'invisible.docx');
    expect(result.parseStatus).toBe('ok');

    const skills = extractAttributes(result.text, {
      referenceDate: CORPUS_REFERENCE_DATE,
    }).flatMap((a) => (a.kind === 'skill' ? [a.canonicalId] : []));

    expect(skills).not.toContain('java');
    expect(skills).toContain('javascript');
  });

  /**
   * Task B.2/B.4 (docs/NEXT_PHASE.md), end to end. The text tier already
   * pins that `experience.ts` parses `13/06/2019` and `15-07-2016` and that
   * `education.ts` resolves "Electronics and Communication" — this confirms
   * neither a real PDF's text layout nor a real DOCX's paragraph structure
   * disturbs either fix before it reaches `packages/core`.
   */
  it('an Indian B.E. and Indian date formats survive a real PDF container', async () => {
    const entry = fixture('indian-be-ece-unambiguous-dates');
    const result = await extractText(await buildFixturePdf(entry), 'indian-be-ece.pdf');
    expect(result.parseStatus).toBe('ok');
    expect(result.language).toBe('en');

    const attrs = extractAttributes(result.text, { referenceDate: CORPUS_REFERENCE_DATE });
    const education = attrs.flatMap((a) => (a.kind === 'education' ? [a] : []));
    expect(education).toHaveLength(1);
    expect(education[0]?.degreeLevel).toBe('bachelor');
    expect(education[0]?.field).toBe('electronics-communication');
    expect(totalYearsExperience(attrs)).toBe(10);
  });

  it('an Indian B.E. and Indian date formats survive a real DOCX container', async () => {
    const entry = fixture('indian-be-ece-unambiguous-dates');
    const result = await extractText(await buildFixtureDocx(entry), 'indian-be-ece.docx');
    expect(result.parseStatus).toBe('ok');
    expect(result.language).toBe('en');

    const attrs = extractAttributes(result.text, { referenceDate: CORPUS_REFERENCE_DATE });
    const education = attrs.flatMap((a) => (a.kind === 'education' ? [a] : []));
    expect(education).toHaveLength(1);
    expect(education[0]?.degreeLevel).toBe('bachelor');
    expect(education[0]?.field).toBe('electronics-communication');
    expect(totalYearsExperience(attrs)).toBe(10);
  });
});

describe('corpus · binary tier · C7 refusals', () => {
  for (const entry of REFUSAL_CORPUS) {
    it(`${entry.id} · is refused, never scored`, async () => {
      const bytes =
        entry.format === 'pdf' ? await buildFixturePdf(entry) : await buildFixtureDocx(entry);
      const result = await extractText(bytes, `${entry.id}.${entry.format}`);

      expect(result.parseStatus).toBe(entry.parseStatus);
      expect(result.reason).toBe(entry.reason);

      // The load-bearing assertion. `language: 'en'` is the single flag the
      // pipeline reads to decide a document may be scored, so a refusal that
      // left it set would be a refusal in name only.
      expect(result.language).toBeNull();
    });
  }
});

/**
 * PDF versus DOCX parity — a metamorphic relation, agreed 2026-08-13.
 *
 * A candidate's score must not depend on which file format they happened to
 * send. The two paths differ measurably in the TEXT they produce: blank lines
 * survive as empty paragraphs in DOCX and vanish entirely in PDF, because a
 * blank line draws no glyphs and the extractor has no vertical-gap heuristic
 * (H-062). That difference is currently inert — `detectSections` skips blank
 * lines and nothing keys on them (H-065) — and this relation is what turns
 * "currently inert" into a checked claim.
 *
 * Attributes are compared, not raw text. Comparing text would fail for the
 * uninteresting reason above; ADR-019's rule is to compare summaries, not
 * spans. Spans legitimately differ between formats because the surrounding
 * text differs, and a relation over them would break for no defect.
 */
describe('corpus · binary tier · format parity (metamorphic)', () => {
  const ALL_FIXTURES = [...CORPUS, ...INDIAN_CV_CORPUS];
  const comparable = ALL_FIXTURES.filter((entry) => entry.pdfUnrenderable === undefined);

  /**
   * Not a silent skip. Every excluded fixture is named, with its reason, so
   * the hole is visible in the test output rather than inferable only by
   * counting. A corpus that quietly covers less than it appears to is the
   * H-004 shape.
   */
  for (const entry of ALL_FIXTURES.filter((e) => e.pdfUnrenderable !== undefined)) {
    it.fails(`${entry.id} · CANNOT be rendered as PDF — DOCX-only coverage (H-067)`, async () => {
      await buildFixturePdf(entry);
    });
  }

  for (const entry of comparable) {
    it(`${entry.id} · PDF and DOCX yield the same attributes`, async () => {
      const [pdf, docx] = await Promise.all([
        extractText(await buildFixturePdf(entry), `${entry.id}.pdf`),
        extractText(await buildFixtureDocx(entry), `${entry.id}.docx`),
      ]);

      // Both must be readable at all, or the comparison below is vacuous — a
      // relation that holds because both sides refused proves nothing
      // (H-052's lesson, and H-060's).
      expect(pdf.parseStatus).toBe('ok');
      expect(docx.parseStatus).toBe('ok');

      /** @param {string} text */
      const summarize = (text) =>
        extractAttributes(text, { referenceDate: CORPUS_REFERENCE_DATE })
          .map((a) => {
            switch (a.kind) {
              case 'skill':
                return `skill:${a.canonicalId}`;
              case 'education':
                return `education:${a.degreeLevel}:${String(a.field)}`;
              case 'certification':
                return `certification:${String(a.canonicalId)}`;
              case 'years_experience':
                return `years:${String(a.years)}:${String(a.isExplicitStatement ?? false)}`;
              case 'unreadable_date_range':
                return `unreadable:${String(a.minPossibleYears)}`;
              case 'unreadable_section':
                return `unreadable-section:${a.section}`;
            }
          })
          .sort();

      expect(summarize(docx.text)).toEqual(summarize(pdf.text));

      // Tenure is the number most exposed to line-structure differences, so it
      // is asserted directly rather than left to the summary comparison.
      const tenure = (/** @type {string} */ text) =>
        totalYearsExperience(extractAttributes(text, { referenceDate: CORPUS_REFERENCE_DATE }));
      expect(tenure(docx.text)).toBe(tenure(pdf.text));
    });
  }
});

/**
 * DOCUMENTED GAP — asserts behaviour that is WRONG, so it cannot be lost.
 *
 * H-041 describes the mixed-language veto's blind spot as "terse CVs — pure
 * bullets, skills lists". **Measured this session, the blind spot is wider than
 * that framing.** The CV below is not terse: it is a full-length prose CV with
 * two employment sections, roughly 35% French by character count, including a
 * complete French employment section. It is classified `ok`, `language: 'en'`,
 * and SCORED — on its English half.
 *
 * Cause: `MIN_WORDS_FOR_SEGMENT_JUDGEMENT` is 15, and ordinary CV lines are
 * 8-13 words. `judgedSegmentCount` comes back 0 — no segment, English or
 * French, is ever judged — so the veto is silent. That is not a property of
 * terse CVs; it is a property of CVs.
 *
 * Verified NOT format-dependent: PDF and DOCX behave identically here, so the
 * blank-line difference of H-062/H-065 is not implicated.
 *
 * **ADR-023 names "a half-French CV scored on its English half" as
 * wrong-score, which BLOCKS.** Whether this instance is the same class is a
 * judgement for whoever asserts the gate — see H-068. It is asserted here as
 * today's behaviour so the question cannot be quietly skipped.
 */
describe('corpus · binary tier · DOCUMENTED GAP (H-041 / H-068)', () => {
  const BILINGUAL_SHORT_PASSAGES = [
    'Rémi Dubois',
    '',
    'Professional Experience',
    '',
    'Senior Software Engineer, Acme Corp, Jan 2020 - Present',
    'Built and operated distributed services in TypeScript and Python.',
    'Maintained PostgreSQL databases and Docker deployments across three regions.',
    'Led the migration of the payments platform to a service-oriented architecture.',
    'Mentored four junior engineers and ran the hiring process for the team.',
    '',
    'Software Engineer, Initech, Jun 2017 - Dec 2019',
    'Developed internal tooling and reporting services used across the company.',
    'Improved build reliability and reduced deployment times substantially.',
    '',
    'Expérience professionnelle',
    '',
    'Ingénieur logiciel senior, Globex, janvier 2016 à décembre 2019',
    'Conception et exploitation de services distribués pour les paiements.',
    'Responsable de la migration des bases de données vers une architecture répartie.',
    'Encadrement d’une équipe de six personnes et gestion des recrutements.',
  ];

  it('a 35%-French full-length CV is REFUSED, in both containers', async () => {
    // WAS a documented-gap fixture asserting `parseStatus: 'ok'` — the defect
    // itself, pinned so it could not be skipped by accident (H-068). ADR-029
    // fixed it, so this now asserts the correct behaviour.
    //
    // It also closes H-073: the old version was titled "is SCORED" and never
    // computed a score, so the word SCORED was asserted by nothing. This
    // version checks the refusal reason AND that the veto actually fired,
    // which is the cause the comment above claims.
    const pdf = await extractText(
      await buildFixturePdf({ lines: BILINGUAL_SHORT_PASSAGES }),
      'bilingual.pdf',
    );
    const docx = await extractText(
      await buildFixtureDocx({ lines: BILINGUAL_SHORT_PASSAGES }),
      'bilingual.docx',
    );

    expect(pdf.parseStatus).toBe('needs_attention');
    expect(pdf.reason).toBe('mixed_language_content');
    expect(pdf.language).toBeNull();

    // Identical in both containers. PDF loses blank lines (H-062/H-065), and
    // the blank-line-delimited variant of this fix FAILED on the PDF path for
    // exactly that reason — so format parity here is load-bearing evidence
    // that the line window is format-independent, not a nicety.
    expect(docx.parseStatus).toBe('needs_attention');
    expect(docx.reason).toBe('mixed_language_content');
    expect(docx.language).toBeNull();
  });

  it('the veto fired because a passage was JUDGED, not because the whole doc flipped', async () => {
    // The cause named in the comment above, asserted rather than described.
    // Without this, a future change that made the whole-document classifier
    // refuse the document for an unrelated reason would keep the test above
    // green while the actual remedy rotted.
    const text = BILINGUAL_SHORT_PASSAGES.join('\n');
    const veto = findNonEnglishSegments(text);
    expect(veto.judgedSegmentCount).toBeGreaterThan(0);
    expect(veto.hasNonEnglishSegment).toBe(true);
    expect(detectLanguageHeuristic(text).isEnglish).toBe(true);
  });
});
