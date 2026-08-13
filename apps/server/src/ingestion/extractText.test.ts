import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractText, UnsupportedFormatError } from './extractText.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readFixture = (name: string): Buffer => readFileSync(path.join(fixturesDir, name));

describe('extractText', () => {
  it('parses a readable English PDF as ok, with text passed through verbatim', async () => {
    const bytes = readFixture('job-english.pdf');
    const result = await extractText(bytes, 'job-english.pdf');

    expect(result.parseStatus).toBe('ok');
    expect(result.language).toBe('en');
    expect(result.text).toContain('Jordan Rivera is a software engineer');
    expect(result.parseConfidence).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it('parses a readable English DOCX as ok', async () => {
    const bytes = readFixture('candidate-english.docx');
    const result = await extractText(bytes, 'candidate-english.docx');

    expect(result.parseStatus).toBe('ok');
    expect(result.language).toBe('en');
    expect(result.text).toContain('Bachelor of Science in Computer Science');
  });

  it('marks a scan-like PDF (< 100 chars/page) as needs_attention without attempting OCR', async () => {
    const bytes = readFixture('candidate-scanned.pdf');
    const result = await extractText(bytes, 'candidate-scanned.pdf');

    expect(result.parseStatus).toBe('needs_attention');
    expect(result.reason).toBe('low_text_density_possible_scan');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toMatch(/scan/i);
    // Never silently score a document we could not read (C7): no language
    // verdict is asserted when the text itself is too sparse to trust.
    expect(result.language).toBeNull();
  });

  it('marks a near-empty DOCX (< 100 total chars) as needs_attention, not scored', async () => {
    const bytes = readFixture('candidate-short.docx');
    const result = await extractText(bytes, 'candidate-short.docx');

    expect(result.parseStatus).toBe('needs_attention');
    expect(result.reason).toBe('low_text_density');
  });

  it('marks non-English text as needs_attention and never assigns a passing language (ADR-006)', async () => {
    const bytes = readFixture('candidate-french.docx');
    const result = await extractText(bytes, 'candidate-french.docx');

    expect(result.parseStatus).toBe('needs_attention');
    expect(result.reason).toBe('non_english_language_not_supported');
    expect(result.language).not.toBe('en');
    expect(result.warnings.join(' ')).toMatch(/english/i);
  });

  it('refuses a mostly-English CV that contains a non-English passage (ADR-022)', async () => {
    // Two English paragraphs plus one French paragraph. The whole-document
    // verdict on this text is ENGLISH — the English statistics dominate — so
    // without the segment veto this document would be scored, with the
    // French third silently fed to English-only extraction. The French in
    // the fixture is deliberately unaccented, which is the harder case and
    // the one real extraction pipelines produce.
    const bytes = readFixture('candidate-mixed-language.docx');
    const result = await extractText(bytes, 'candidate-mixed-language.docx');

    expect(result.parseStatus).toBe('needs_attention');
    expect(result.reason).toBe('mixed_language_content');
    expect(result.language).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/mix/i);
  });

  it('names the offending passage in the mixed-language warning rather than just refusing', async () => {
    // A recruiter has to be able to act on a refusal; "not supported" with
    // no location is not actionable on a five-page CV.
    const bytes = readFixture('candidate-mixed-language.docx');
    const result = await extractText(bytes, 'candidate-mixed-language.docx');

    expect(result.warnings.join(' ')).toMatch(/Elle a travaille/);
  });

  it('still accepts a wholly English DOCX — the veto does not fire on clean input', async () => {
    const bytes = readFixture('candidate-english.docx');
    const result = await extractText(bytes, 'candidate-english.docx');

    expect(result.parseStatus).toBe('ok');
    expect(result.reason).toBeNull();
    expect(result.language).toBe('en');
  });

  it('marks a completely blank PDF (no extractable text at all) as failed, not scored', async () => {
    const bytes = readFixture('blank.pdf');
    const result = await extractText(bytes, 'blank.pdf');

    expect(result.parseStatus).toBe('failed');
    expect(result.reason).toBe('no_extractable_text');
    expect(result.parseConfidence).toBe(0);
    expect(result.language).toBeNull();
  });

  it('marks a completely blank DOCX (no extractable text at all) as failed, not scored', async () => {
    const bytes = readFixture('blank.docx');
    const result = await extractText(bytes, 'blank.docx');

    expect(result.parseStatus).toBe('failed');
    expect(result.reason).toBe('no_extractable_text');
    expect(result.parseConfidence).toBe(0);
    expect(result.language).toBeNull();
  });

  it('flags needs_attention (language undetermined) for text that clears the density floor but has too few real words to judge', async () => {
    // Clears MIN_CHARS_PER_PAGE (114 significant chars) but has only 7
    // alphabetic word tokens, under detectLanguageHeuristic's floor of 8 —
    // never silently score what the language heuristic cannot judge.
    const bytes = readFixture('codes-only.pdf');
    const result = await extractText(bytes, 'codes-only.pdf');

    expect(result.parseStatus).toBe('needs_attention');
    expect(result.reason).toBe('language_undetermined');
    expect(result.language).toBeNull();
  });

  it('rejects an unsupported format naming the file and the reason', async () => {
    const bytes = readFixture('unsupported.txt');

    await expect(extractText(bytes, 'unsupported.txt')).rejects.toThrow(UnsupportedFormatError);
    await expect(extractText(bytes, 'unsupported.txt')).rejects.toThrow(/unsupported\.txt/);
    await expect(extractText(bytes, 'unsupported.txt')).rejects.toThrow(
      /\.pdf.*\.docx|\.docx.*\.pdf/is,
    );
  });

  it('produces PDF text offsets that line up with the raw extracted text (no post-hoc trimming)', async () => {
    const bytes = readFixture('job-english.pdf');
    const result = await extractText(bytes, 'job-english.pdf');

    const needle = 'Jordan has led migrations to microservices';
    const idx = result.text.indexOf(needle);
    expect(idx).toBeGreaterThan(-1);
    expect(result.text.slice(idx, idx + needle.length)).toBe(needle);
  });
});
