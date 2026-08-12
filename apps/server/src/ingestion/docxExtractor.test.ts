import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractDocxText } from './docxExtractor.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readFixture = (name: string): Buffer => readFileSync(path.join(fixturesDir, name));

describe('extractDocxText', () => {
  it('extracts the real paragraph text from a valid docx', async () => {
    const result = await extractDocxText(readFixture('candidate-english.docx'));
    expect(result.text).toContain('Jordan Rivera is a software engineer');
    expect(result.text).toContain('Bachelor of Science in Computer Science');
  });

  it('reports significantCharCount as the trimmed text length', async () => {
    const result = await extractDocxText(readFixture('candidate-short.docx'));
    expect(result.text.trim()).toBe('Jordan Rivera - Software Engineer');
    expect(result.significantCharCount).toBe('Jordan Rivera - Software Engineer'.length);
  });

  it('passes non-English text through verbatim without altering it', async () => {
    const result = await extractDocxText(readFixture('candidate-french.docx'));
    expect(result.text).toContain('Jordan Rivera est ingenieur logiciel');
  });

  it('surfaces mammoth warning messages rather than discarding them', async () => {
    const clean = await extractDocxText(readFixture('candidate-english.docx'));
    expect(clean.warnings).toEqual([]);

    // Real mammoth warning path: a paragraph references a style ID that is
    // not defined anywhere in the document.
    const withWarning = await extractDocxText(readFixture('candidate-unrecognized-style.docx'));
    expect(withWarning.warnings).toHaveLength(1);
    expect(withWarning.warnings[0]).toMatch(/style/i);
    expect(withWarning.text).toContain('Jordan Rivera is a software engineer');
  });
});
