import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractPdfText } from './pdfExtractor.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readFixture = (name: string): Buffer => readFileSync(path.join(fixturesDir, name));

describe('extractPdfText', () => {
  it('extracts real, readable text per page from a text-based PDF, in page order', async () => {
    const result = await extractPdfText(readFixture('job-english.pdf'));

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.text).toContain('Jordan Rivera is a software engineer');
    expect(result.pages[1]?.text).toContain('Jordan has led migrations to microservices');
    // Word-boundary check: the join algorithm must not glue adjacent runs
    // into one token.
    expect(result.pages[0]?.text).toContain('backend');
    expect(result.pages[0]?.text).not.toContain('backendsystems');
  });

  it('produces well over 100 significant characters per page for a real text page', async () => {
    const result = await extractPdfText(readFixture('job-english.pdf'));
    for (const page of result.pages) {
      expect(page.significantCharCount).toBeGreaterThan(100);
    }
  });

  it('reports well under 100 significant characters per page for a sparse (scan-like) PDF', async () => {
    const result = await extractPdfText(readFixture('candidate-scanned.pdf'));
    expect(result.pages).toHaveLength(2);
    for (const page of result.pages) {
      expect(page.significantCharCount).toBeLessThan(100);
    }
  });

  it('joins all pages into result.text separated by newlines, verbatim (no re-trimming)', async () => {
    const result = await extractPdfText(readFixture('job-english.pdf'));
    const rejoined = result.pages.map((p) => p.text).join('\n');
    expect(result.text).toBe(rejoined);
  });
});
