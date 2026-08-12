import { quantize } from '../numeric/round.js';
import { TAXONOMY } from '../taxonomy/data.js';
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

interface GazetteerTerm {
  readonly term: string; // normalized (lowercase) surface form to search for
  readonly canonicalId: string;
  readonly matchType: SkillExtractionMatchType;
}

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
 * Confidence: 0.95 for a mention of the canonical id/label itself, 0.80 for
 * an alias, +0.05 (capped at 1.0) when the mention falls inside a detected
 * "Skills" section.
 */
export function extractSkills(text: string): readonly SkillAttribute[] {
  if (text.length === 0) return [];

  const claimed = new Array<boolean>(text.length).fill(false);
  const skillSectionRanges = detectSections(text).filter((s) => s.name === 'skills');

  const found: SkillAttribute[] = [];

  for (const { term, canonicalId, matchType } of GAZETTEER) {
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, 'gi');
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

  return found.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
