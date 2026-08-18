/**
 * HTML → plain text for link-ingested job postings (ADR-037).
 *
 * Hand-rolled on purpose: a readability library (jsdom, @mozilla/readability)
 * would drag a large dependency tree through the licence gate
 * (ADR-003/016/033 make every package expensive by design) to solve a
 * problem this slice does not have — job postings are text-heavy documents,
 * and a conservative tag-stripper recovers their text faithfully.
 *
 * What "conservative" costs, stated: page boilerplate (navigation labels,
 * cookie banners, footer links) survives into the text. That noise is
 * bounded by the product's own confirmation step — requirement proposals are
 * suggestions a person reviews chip by chip before anything is scored
 * (PRODUCT_DECISIONS), so a footer's stray "Java" cannot enter a job's
 * requirements unseen. A boilerplate-trimming pass is a measured future
 * step, not a prerequisite.
 *
 * NOT a general HTML parser. No DOM, no attribute semantics, no CSS. It
 * makes exactly three promises: non-content blocks are dropped whole,
 * block boundaries become line breaks, and entities render as their
 * characters. Malformed input degrades to "more text survives", never to a
 * crash — refusal decisions belong to the language gates downstream.
 */

/** Elements whose CONTENT is noise, dropped whole (case-insensitive,
 *  tolerant of attributes and of a missing close tag at EOF). */
const DROP_WHOLE = /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi;

/** Tags that end a visual block — each becomes a newline so downstream
 *  line-oriented extraction (sections, bullets) sees the same shape a
 *  PDF/DOCX of the posting would produce. */
const BLOCK_BOUNDARY =
  /<\/?(p|div|br|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|main|aside|nav|blockquote|dt|dd|dl|form|fieldset)\b[^>]*\/?>/gi;

const ANY_TAG = /<[^>]+>/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  bull: '•',
  middot: '·',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  eacute: 'é',
  egrave: 'è',
  copy: '©',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]{2,8});/gi, (whole: string, name: string) => {
      const known = NAMED_ENTITIES[name.toLowerCase()];
      // An unknown entity stays verbatim — inventing characters is worse
      // than showing "&trade;" as-is.
      return known ?? whole;
    });
}

/** Below this many letters/digits, a page's markup effectively carries no
 *  content (the JS-rendered-shell case). Shared by the extraction gate and
 *  the fetch layer's known-board fallback so they cannot disagree. */
export const MIN_HTML_TEXT_CHARS = 100;

export interface HtmlExtraction {
  /** The page's visible text, one line per visual block, blank-line
   *  separated paragraphs collapsed to at most one blank line. */
  readonly text: string;
  /** The <title> content, decoded and trimmed — the page's own name for
   *  itself, used as the default job title when the recruiter gives none.
   *  Empty string when the page has no usable title. */
  readonly title: string;
  /** Letters/digits, the same significance measure the DOCX path uses. */
  readonly significantCharCount: number;
}

export function extractHtmlText(html: string): HtmlExtraction {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const title = decodeEntities((titleMatch?.[1] ?? '').replace(ANY_TAG, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  const text = decodeEntities(
    html
      .replace(HTML_COMMENT, ' ')
      .replace(DROP_WHOLE, ' ')
      .replace(BLOCK_BOUNDARY, '\n')
      .replace(ANY_TAG, ' '),
  )
    // Normalize within lines first, then collapse the vertical whitespace the
    // block-boundary pass produced.
    .split('\n')
    .map((line) => line.replace(/[ \t\u00A0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const significantCharCount = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return { text, title, significantCharCount };
}

/* ── schema.org JobPosting (JSON-LD) ──────────────────────────────────────
 *
 * Measured 2026-08-17 (H-120): the dominant hosted-board shape is a
 * JavaScript shell whose MARKUP carries no posting text, with the posting
 * embedded as `<script type="application/ld+json">` JSON-LD for job-search
 * SEO. The tag-stripper above deliberately drops scripts, so it sees
 * nothing. JSON-LD is not site-specific scraping — it is the schema.org
 * standard boards emit precisely so machines can read their postings, and
 * it is BETTER than page soup: title, organization and description with no
 * navigation boilerplate at all.
 */

const LD_JSON_BLOCK =
  /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

interface JsonLdJobPosting {
  readonly title: string;
  readonly text: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function typeOf(record: Record<string, unknown>): readonly string[] {
  const t = record['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

function nameOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  const name = record?.['name'];
  return typeof name === 'string' ? name : '';
}

function locationLineOf(value: unknown): string {
  const places = Array.isArray(value) ? value : [value];
  const parts: string[] = [];
  for (const place of places) {
    const address = asRecord(asRecord(place)?.['address']);
    if (address === null) continue;
    const piece = ['addressLocality', 'addressRegion', 'addressCountry']
      .map((k) => address[k])
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .join(', ');
    if (piece !== '') parts.push(piece);
  }
  return parts.join(' · ');
}

/** Finds the first schema.org JobPosting in the page's JSON-LD blocks and
 *  renders it as plain text (the description is an HTML string per the
 *  standard, so it goes through the same stripper as page markup). Returns
 *  null when no posting with a usable description exists — the caller falls
 *  back to markup text. Malformed JSON in one block never poisons another. */
export function extractJobPostingJsonLd(html: string): JsonLdJobPosting | null {
  for (const match of html.matchAll(LD_JSON_BLOCK)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? '');
    } catch {
      continue; // one bad block must not hide a good one elsewhere
    }

    const roots = Array.isArray(parsed) ? parsed : [parsed];
    const candidates: Record<string, unknown>[] = [];
    for (const root of roots) {
      const record = asRecord(root);
      if (record === null) continue;
      candidates.push(record);
      const graph = record['@graph'];
      if (Array.isArray(graph)) {
        for (const node of graph) {
          const nodeRecord = asRecord(node);
          if (nodeRecord !== null) candidates.push(nodeRecord);
        }
      }
    }

    for (const posting of candidates) {
      if (!typeOf(posting).includes('JobPosting')) continue;
      const description = posting['description'];
      if (typeof description !== 'string' || description.trim() === '') continue;

      const title = typeof posting['title'] === 'string' ? posting['title'].trim() : '';
      const organization = nameOf(posting['hiringOrganization']);
      const location = locationLineOf(posting['jobLocation']);
      const employment = posting['employmentType'];
      const employmentLine = (Array.isArray(employment) ? employment : [employment])
        .filter((v): v is string => typeof v === 'string')
        .join(', ');

      const header = [
        title,
        organization,
        [location, employmentLine].filter((x) => x !== '').join(' · '),
      ]
        .filter((line) => line !== '')
        .join('\n');
      const body = extractHtmlText(description).text;
      const extras = ['qualifications', 'responsibilities', 'skills']
        .map((k) => posting[k])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .map((v) => extractHtmlText(v).text);

      return { title, text: [header, body, ...extras].filter((x) => x !== '').join('\n\n') };
    }
  }
  return null;
}

export interface JobPageExtraction extends HtmlExtraction {
  /** Where the text came from: the page's own JSON-LD JobPosting (clean,
   *  boilerplate-free) or the stripped markup. */
  readonly source: 'json-ld' | 'markup';
}

/** The job-page entry point (ADR-037): JSON-LD posting when the page
 *  carries one, stripped markup otherwise. */
export function extractJobPageText(html: string): JobPageExtraction {
  const posting = extractJobPostingJsonLd(html);
  if (posting !== null) {
    const significantCharCount = (posting.text.match(/[\p{L}\p{N}]/gu) ?? []).length;
    const markupTitle = extractHtmlText(html).title;
    return {
      text: posting.text,
      title: posting.title !== '' ? posting.title : markupTitle,
      significantCharCount,
      source: 'json-ld',
    };
  }
  return { ...extractHtmlText(html), source: 'markup' };
}
