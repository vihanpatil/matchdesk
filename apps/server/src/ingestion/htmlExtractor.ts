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
