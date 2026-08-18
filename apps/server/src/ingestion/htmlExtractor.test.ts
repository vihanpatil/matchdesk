import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractHtmlText, extractJobPageText, extractJobPostingJsonLd } from './htmlExtractor.js';

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

describe('extractJobPostingJsonLd / extractJobPageText (H-120)', () => {
  // The dominant hosted-board shape, measured on real links 2026-08-17: a
  // JS shell whose markup carries nothing, with the posting in JSON-LD.
  it('recovers the posting from the Ashby-shaped fixture: title, org, location and the HTML description as text', () => {
    const page = extractJobPageText(fixture('job-posting-jsonld.html'));
    expect(page.source).toBe('json-ld');
    expect(page.title).toBe('Backend Engineer, Platform');
    const lines = page.text.split('\n');
    expect(lines).toContain('Backend Engineer, Platform');
    expect(lines).toContain('Meridian Analytics');
    expect(lines).toContain('5+ years of experience building backend services');
    expect(lines).toContain('Experience with Docker & continuous integration');
    expect(lines).toContain("Bachelor's degree in Computer Science or equivalent experience");
    expect(page.significantCharCount).toBeGreaterThan(100);
    // None of the shell's boilerplate leaks into JSON-LD-sourced text.
    expect(page.text).not.toContain('Privacy');
  });

  it('finds a JobPosting inside an @graph and inside a top-level array', () => {
    const graph = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":"JobPosting","title":"Data Engineer","description":"<p>Builds pipelines in Python for a data team of nine people.</p>"}]}</script>`;
    expect(extractJobPostingJsonLd(graph)?.title).toBe('Data Engineer');
    const arr = `<script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"JobPosting","title":"QA Analyst","description":"Runs the release checklist."}]</script>`;
    expect(extractJobPostingJsonLd(arr)?.title).toBe('QA Analyst');
  });

  it('one malformed JSON-LD block does not hide a good one later in the page', () => {
    const html = `<script type="application/ld+json">{broken</script><script type="application/ld+json">{"@type":"JobPosting","title":"Ops Lead","description":"Keeps the lights on."}</script>`;
    expect(extractJobPostingJsonLd(html)?.title).toBe('Ops Lead');
  });

  it('a JobPosting without a usable description is not a posting — falls back to markup', () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Ghost"}</script><p>Visible page prose stands in.</p>`;
    expect(extractJobPostingJsonLd(html)).toBeNull();
    const page = extractJobPageText(html);
    expect(page.source).toBe('markup');
    expect(page.text).toContain('Visible page prose stands in.');
  });

  it('a page with no JSON-LD at all is plain markup extraction', () => {
    expect(extractJobPageText(fixture('job-posting.html')).source).toBe('markup');
  });
});
