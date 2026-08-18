import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractHtmlText } from './htmlExtractor.js';

const fixture = (name: string): string =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

describe('extractHtmlText', () => {
  it('recovers the posting text from the realistic fixture: headings, bullets and prose on their own lines', () => {
    const { text } = extractHtmlText(fixture('job-posting.html'));
    const lines = text.split('\n');
    expect(lines).toContain('Senior Backend Engineer');
    expect(lines).toContain('Requirements');
    expect(lines).toContain('5+ years of experience building backend services');
    expect(lines).toContain('Strong Python and PostgreSQL skills');
    expect(lines).toContain("Bachelor's degree in Computer Science or equivalent experience");
  });

  it('drops script and style content whole — no analytics stub or CSS in the text', () => {
    const { text } = extractHtmlText(fixture('job-posting.html'));
    expect(text).not.toContain('analyticsStub');
    expect(text).not.toContain('font-family');
    expect(text).not.toContain('req-4187');
  });

  it('extracts the decoded <title> for use as a default job title', () => {
    expect(extractHtmlText(fixture('job-posting.html')).title).toBe(
      'Senior Backend Engineer – Meridian Analytics',
    );
  });

  it('decodes named, decimal and hex entities; unknown entities stay verbatim', () => {
    const { text } = extractHtmlText(
      '<p>Fish &amp; Chips &#8211; caf&#xE9; &middot; B&uuml;ro &trade;</p>',
    );
    expect(text).toBe('Fish & Chips – café · B&uuml;ro &trade;');
  });

  it('turns block boundaries into line breaks but keeps inline markup on one line', () => {
    const { text } = extractHtmlText(
      '<p>A <strong>bold</strong> and <em>tidy</em> line.</p><p>Second paragraph.</p>',
    );
    // Two newlines: </p> and the next <p> each mark a block boundary, so
    // paragraphs arrive blank-line separated — the shape the language
    // detector's PARAGRAPH_BOUNDARY pass expects.
    expect(text).toBe('A bold and tidy line.\n\nSecond paragraph.');
  });

  it('survives malformed HTML without crashing — an unclosed script at EOF eats to the end, an unclosed div does not', () => {
    expect(extractHtmlText('<div>kept text<script>lost = true;').text).toBe('kept text');
    expect(extractHtmlText('<div>first<div>second').text).toBe('first\nsecond');
  });

  it('counts significant characters the way the DOCX floor does: letters and digits only', () => {
    expect(extractHtmlText('<p>ab 12 — •</p>').significantCharCount).toBe(4);
    expect(extractHtmlText('<script>let x = 1;</script>').significantCharCount).toBe(0);
  });

  it('reports an empty title when the page has none', () => {
    expect(extractHtmlText('<p>no title here</p>').title).toBe('');
  });

  it('the SPA-shell fixture yields almost nothing — the low-text gate has something to catch', () => {
    const { significantCharCount } = extractHtmlText(fixture('job-posting-spa.html'));
    expect(significantCharCount).toBeLessThan(100);
    expect(significantCharCount).toBeGreaterThan(0); // the footer nav survives
  });
});
