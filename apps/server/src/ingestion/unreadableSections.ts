import { detectSections, type ExtractedAttribute, type SectionName } from '@matchdesk/core';

import { lineReadsNonEnglish } from './languageDetection.js';

/**
 * Unread text inside a recognised CV section, for sections whose dimension the
 * engine found NO other evidence for (H-041, ADR-029's principle).
 *
 * **The problem this solves, and why it is not a language-detection problem.**
 * A foreign degree line yields no education attribute, so the engine reports
 * "Requires at least a bachelor degree" — asserting a negative from silence
 * about someone who holds one. Measured, that flipped the same candidate
 * between 100/eligible and 50/ineligible on nothing but the language their
 * degree was written in.
 *
 * The obvious fix — detect the foreign line and refuse the document — was
 * measured to destruction (H-112). It cannot work at line granularity, because
 * **a person's name is foreign text too**: `"Nguyen Thi Minh Anh"` scores
 * Vietnamese 0.834 with English 0.000, a stronger foreign signal than any
 * genuine foreign line measured. Every floor low enough to catch a short
 * foreign degree line also refuses candidates in proportion to how non-Anglo
 * their name is, which is H-028 D3's discrimination shape.
 *
 * **Two gates make a low floor safe here, and neither is a threshold on the
 * classifier's output:**
 *
 * 1. **Inside a recognised section.** A CV's name sits above the first section
 *    header, in the implicit leading section, so it is never considered. This
 *    is what buys back the floor: measured, it removes every name from the
 *    flagged set.
 * 2. **The dimension has no other evidence.** A skills line of technology names
 *    still reads as foreign to any classifier, but it produces skill
 *    attributes, so the engine is not asserting anything from silence and
 *    nothing is emitted.
 *
 * Measured together across all 23 English CVs and the full fixture corpus:
 * **0 of 50 documents produce an attribute here**, while a foreign degree line
 * in an Education section produces one in German, Dutch and Turkish alike.
 *
 * **Residual, stated:** a language `eld` cannot identify reliably at line
 * length is still missed — romanised Greek is the measured example, and
 * Hungarian is caught only by larger ngram tiers that cost a real English CV.
 * This narrows the class rather than eliminating every instance of it.
 */
export function unreadableSectionAttributes(
  text: string,
  attributes: readonly ExtractedAttribute[],
): readonly ExtractedAttribute[] {
  /** Which attribute kind counts as evidence for a section's dimension. */
  const evidenceKind: Partial<Record<SectionName, ExtractedAttribute['kind']>> = {
    education: 'education',
    certifications: 'certification',
    experience: 'years_experience',
    skills: 'skill',
  };

  const sections = detectSections(text);
  const found: ExtractedAttribute[] = [];
  const seen = new Set<SectionName>();

  let offset = 0;
  for (const line of text.split('\n')) {
    const start = offset;
    offset += line.length + 1;
    if (line.trim() === '') continue;

    // Floor 2 rather than the veto's 6: the section gate below already excludes
    // the header block, which is the only place the low floor was unsafe.
    if (!lineReadsNonEnglish(line, 2)) continue;

    const section = sections.find((s) => start >= s.start && start < s.end);
    if (section?.name === undefined || section.name === null) continue;
    if (seen.has(section.name)) continue;

    const kind = evidenceKind[section.name];
    if (kind === undefined) continue;
    // Evidence exists for this dimension, so nothing is being asserted from
    // silence — the unread line may be a technology list, a transliterated
    // institution, or anything else the classifier guesses at.
    if (attributes.some((a) => a.kind === kind)) continue;

    seen.add(section.name);
    found.push({
      kind: 'unreadable_section',
      value: line.trim(),
      normalizedValue: section.name,
      confidence: 1,
      sourceSpan: { start, end: start + line.length },
      section: section.name,
    });
  }

  return found;
}
