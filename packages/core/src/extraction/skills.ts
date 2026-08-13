import { quantize } from '../numeric/round.js';
import { TAXONOMY } from '../taxonomy/data.js';
import { extractIgnoringInvisibleCharacters } from './invisible.js';
import { assertValidSpan } from './span.js';
import { detectSections } from './sections.js';
import type { SkillAttribute, SkillExtractionMatchType } from './types.js';

const EXACT_CONFIDENCE = 0.95;
const ALIAS_CONFIDENCE = 0.8;
const SKILLS_SECTION_BONUS = 0.05;

function normalize(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Surface forms at or below this length are treated as "ambiguous short
 * terms" (H-028 D3) and additionally require list-like context — see
 * `hasListContext`. Chosen to cover every single-character taxonomy entry
 * (`r`, `c`) and short two-letter ones (`go`, and aliases like `js`/`ts`/
 * `ml`/`py`) without touching anything longer, which is distinctive enough
 * in its own spelling to stand alone.
 */
const AMBIGUOUS_TERM_MAX_LENGTH = 2;

/**
 * Punctuation that, attached directly to an ambiguous short term, produced a
 * false positive in production (H-028 D3): an apostrophe forms a
 * contraction/possessive ("C'est", "Rémi's"), an ampersand forms an
 * abbreviation ("R&D"), and a hyphen forms a compound word ("Go-to-market").
 * None of these characters is itself a letter or digit, so the ordinary
 * word-boundary guard below treats them as valid boundaries — which is
 * exactly the bug. This blacklist is checked ONLY for ambiguous short terms;
 * ordinary multi-character terms are unaffected.
 */
const ATTACHED_PUNCTUATION = new Set(["'", '’', '&', '-', '–', '—']);

/**
 * Delimiters that indicate a term sits in a genuine list-like position —
 * comma, semicolon, pipe, colon-separated skill lists (the format every real
 * CV and this codebase's own `testkit/cv.ts` renders skills in), or at the
 * very start/end of a line.
 */
function isListDelimiter(ch: string | undefined): boolean {
  return ch === undefined || ch === ',' || ch === ';' || ch === '|' || ch === ':' || ch === '\n';
}

/**
 * Corroborating-context guard for ambiguous short terms (H-028 D3): a
 * single- or double-character skill (`r`, `c`, `go`, ...) is real vocabulary
 * and must still be found in an actual skills list ("Skills: R, Python"),
 * but the SAME literal characters recur constantly inside prose, names and
 * abbreviations where they mean nothing ("Rémi", "R&D", "C'est",
 * "Go-to-market"). Trusting a match therefore requires BOTH:
 *  1. neither neighboring character is attached punctuation that forms a
 *     contraction, possessive or compound word, and
 *  2. on at least one side, the nearest non-space character is a list
 *     delimiter or a line boundary — the shape every skills list takes.
 */
function hasListContext(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined;
  const after = end < text.length ? text[end] : undefined;

  if (before !== undefined && ATTACHED_PUNCTUATION.has(before)) return false;
  if (after !== undefined && ATTACHED_PUNCTUATION.has(after)) return false;

  let beforeIdx = start - 1;
  while (beforeIdx >= 0 && (text[beforeIdx] === ' ' || text[beforeIdx] === '\t')) beforeIdx -= 1;
  const nearestBefore = beforeIdx >= 0 ? text[beforeIdx] : undefined;

  let afterIdx = end;
  while (afterIdx < text.length && (text[afterIdx] === ' ' || text[afterIdx] === '\t')) {
    afterIdx += 1;
  }
  const nearestAfter = afterIdx < text.length ? text[afterIdx] : undefined;

  return isListDelimiter(nearestBefore) || isListDelimiter(nearestAfter);
}

interface GazetteerTerm {
  readonly term: string; // normalized (lowercase) surface form to search for
  readonly canonicalId: string;
  readonly matchType: SkillExtractionMatchType;
}

/**
 * H-028 D2: longest-first gazetteer matching means a mention of "Ruby on
 * Rails" claims every character of the phrase for `rails`, so `ruby` is
 * never separately found — a Rails developer was scored ineligible for a
 * job requiring "Ruby", despite Ruby on Rails being, definitionally, Ruby.
 *
 * A CURATED list, deliberately — the same shape and reasoning as the R6c
 * test's own `IMPLIES` table (see `metamorphic/extraction.metamorphic.test.ts`).
 * Each pair is a human judgement that the specific term genuinely,
 * definitionally implies the general one, not merely that they are
 * taxonomy-adjacent (which is what `related` already exists for, and
 * already gives partial "related" credit in the scoring cascade without
 * this list). This CANNOT be derived mechanically from the taxonomy or from
 * substring matching: "C Sharp" must NOT imply "C" (a different language),
 * and "JavaScript" must NOT imply "Java" (an unrelated language whose name
 * literally contains a substring match) — both are excluded here for
 * exactly that reason, on purpose.
 *
 * Emits BOTH the specific and the implied general skill, at `matchType:
 * 'alias'` confidence — genuinely knowing "Ruby on Rails" IS genuinely
 * knowing Ruby, so this is stronger than the cascade's "related" tier
 * (0.70, for merely taxonomy-adjacent skills), which is deliberately not
 * enough to satisfy a must-have gate (see `eligibility.ts`). The evidence
 * span points at the SPECIFIC mention ("Ruby on Rails"), never at
 * fabricated text — an honest span for an inferred skill, unlike the
 * phantom-degree evidence spans H-028 D4 also fixed.
 */
const IMPLIES: readonly (readonly [specificId: string, impliedId: string])[] = [
  ['rails', 'ruby'],
  ['sql-server', 'sql'],
  ['spring-boot', 'spring'],
  ['github-actions', 'github'],
];

/**
 * Every searchable surface form, longest-first so multi-word / longer terms
 * (e.g. "Node.js") win over shorter ones they contain (e.g. "node"). Built
 * once at module load — pure derivation from the taxonomy, no I/O.
 */
const GAZETTEER: readonly GazetteerTerm[] = (() => {
  const terms: GazetteerTerm[] = [];
  for (const entry of TAXONOMY.entries) {
    const exactSet = new Set([normalize(entry.id), normalize(entry.label)]);
    for (const term of exactSet) {
      terms.push({ term, canonicalId: entry.id, matchType: 'exact' });
    }
    for (const alias of entry.aliases) {
      const normalized = normalize(alias);
      if (exactSet.has(normalized)) continue; // already classified exact for this entry
      terms.push({ term: normalized, canonicalId: entry.id, matchType: 'alias' });
    }
  }
  return terms
    .slice()
    .sort(
      (a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0),
    );
})();

/**
 * Gazetteer matching against the taxonomy (Section 2 technique). Scans the
 * whole input for the longest non-overlapping mention of every canonical
 * skill or alias, word-boundary delimited so "Go" never matches inside
 * "Google" and "R" never matches inside "React".
 *
 * The boundary itself is Unicode-aware (`\p{L}`/`\p{N}` under the `u` flag,
 * not `[A-Za-z0-9]`) — H-028 D3: the ASCII-only guard treated every accented
 * letter as a word boundary, so "Rémi" produced an exact match for the
 * skill `r`. Ambiguous short terms (see `AMBIGUOUS_TERM_MAX_LENGTH`) go
 * through the additional `hasListContext` guard below for the same reason.
 *
 * Confidence: 0.95 for a mention of the canonical id/label itself, 0.80 for
 * an alias, +0.05 (capped at 1.0) when the mention falls inside a detected
 * "Skills" section.
 */
export function extractSkills(text: string): readonly SkillAttribute[] {
  return extractIgnoringInvisibleCharacters(text, extractSkillsFromVisibleText);
}

function extractSkillsFromVisibleText(text: string): readonly SkillAttribute[] {
  if (text.length === 0) return [];

  const claimed = new Array<boolean>(text.length).fill(false);
  const skillSectionRanges = detectSections(text).filter((s) => s.name === 'skills');

  const found: SkillAttribute[] = [];

  for (const { term, canonicalId, matchType } of GAZETTEER) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      // Every gazetteer term is non-empty (asserted by taxonomy/data.test.ts),
      // so `match[0]` can never be zero-length here — no zero-width-match
      // infinite-loop guard is needed, unlike a regex that could match "".
      const end = start + match[0].length;

      let overlaps = false;
      for (let i = start; i < end; i += 1) {
        if (claimed[i] === true) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      // Ambiguous short term (H-028 D3): trust it only in list-like context.
      // Checked before claiming, so a rejected match leaves its span free
      // for some other gazetteer term to claim.
      if (term.length <= AMBIGUOUS_TERM_MAX_LENGTH && !hasListContext(text, start, end)) {
        continue;
      }

      for (let i = start; i < end; i += 1) claimed[i] = true;

      const value = text.slice(start, end);
      const inSkillsSection = skillSectionRanges.some((s) => start >= s.start && end <= s.end);
      const base = matchType === 'exact' ? EXACT_CONFIDENCE : ALIAS_CONFIDENCE;
      const confidence = quantize(Math.min(1, base + (inSkillsSection ? SKILLS_SECTION_BONUS : 0)));

      const sourceSpan = { start, end };
      assertValidSpan(text, sourceSpan, value);

      found.push({
        kind: 'skill',
        value,
        normalizedValue: canonicalId,
        confidence,
        sourceSpan,
        canonicalId,
        matchType,
      });
    }
  }

  // Genuinely-implied shorter skills (H-028 D2) — see IMPLIES. Runs after
  // the main gazetteer pass so it sees every specific mention that was
  // found, and is skipped whenever the implied skill was ALREADY found on
  // its own merits (independently, anywhere in the text), so a candidate
  // who separately lists both "Ruby" and "Ruby on Rails" gets one `ruby`
  // attribute, not two.
  const foundCanonicalIds = new Set(found.map((a) => a.canonicalId));
  for (const specific of found.slice()) {
    for (const [specificId, impliedId] of IMPLIES) {
      if (specific.canonicalId !== specificId) continue;
      if (foundCanonicalIds.has(impliedId)) continue;

      const inSkillsSection = skillSectionRanges.some(
        (s) => specific.sourceSpan.start >= s.start && specific.sourceSpan.end <= s.end,
      );
      const confidence = quantize(
        Math.min(1, ALIAS_CONFIDENCE + (inSkillsSection ? SKILLS_SECTION_BONUS : 0)),
      );

      found.push({
        kind: 'skill',
        value: specific.value,
        normalizedValue: impliedId,
        confidence,
        sourceSpan: specific.sourceSpan,
        canonicalId: impliedId,
        matchType: 'alias',
      });
      foundCanonicalIds.add(impliedId);
    }
  }

  return found.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
