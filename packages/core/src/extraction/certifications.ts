import { quantize } from '../numeric/round.js';
import { assertValidSpan } from './span.js';
import type { CertificationAttribute } from './types.js';

const EXACT_CONFIDENCE = 0.9;
const ALIAS_CONFIDENCE = 0.75;

/**
 * A small gazetteer of well-known certifications. Not exhaustive — this is
 * the thin-slice seed, extending it is additive in the same way the skills
 * taxonomy is.
 */
const CERTIFICATIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
}[] = [
  {
    id: 'aws-saa',
    label: 'AWS Certified Solutions Architect',
    aliases: ['aws solutions architect', 'aws csa'],
  },
  {
    id: 'aws-dev-associate',
    label: 'AWS Certified Developer Associate',
    aliases: ['aws developer associate'],
  },
  { id: 'pmp', label: 'Project Management Professional', aliases: ['pmp'] },
  { id: 'csm', label: 'Certified ScrumMaster', aliases: ['csm', 'certified scrum master'] },
  { id: 'cissp', label: 'CISSP', aliases: ['certified information systems security professional'] },
  { id: 'cpa', label: 'Certified Public Accountant', aliases: ['cpa'] },
  { id: 'cfa', label: 'Chartered Financial Analyst', aliases: ['cfa'] },
  {
    id: 'six-sigma',
    label: 'Six Sigma',
    aliases: ['six sigma black belt', 'six sigma green belt'],
  },
  { id: 'itil', label: 'ITIL', aliases: ['itil foundation'] },
  { id: 'comptia-a-plus', label: 'CompTIA A+', aliases: ['comptia a+'] },
  {
    id: 'azure-admin',
    label: 'Microsoft Certified: Azure Administrator',
    aliases: ['azure administrator', 'az-104'],
  },
  {
    id: 'gcp-professional',
    label: 'Google Cloud Professional',
    aliases: ['google cloud certified', 'gcp professional'],
  },
];

function normalize(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface GazetteerTerm {
  readonly term: string;
  readonly canonicalId: string;
  readonly isExact: boolean;
}

const GAZETTEER: readonly GazetteerTerm[] = (() => {
  const terms: GazetteerTerm[] = [];
  for (const cert of CERTIFICATIONS) {
    const exactSet = new Set([normalize(cert.id), normalize(cert.label)]);
    for (const term of exactSet) terms.push({ term, canonicalId: cert.id, isExact: true });
    for (const alias of cert.aliases) {
      const normalized = normalize(alias);
      if (exactSet.has(normalized)) continue;
      terms.push({ term: normalized, canonicalId: cert.id, isExact: false });
    }
  }
  return terms
    .slice()
    .sort(
      (a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0),
    );
})();

/**
 * Gazetteer matching against a small certification list (Section 2
 * technique, same shape as `extractSkills`). In this slice, extraction is
 * purely gazetteer-driven, so every emitted attribute's `canonicalId` is
 * populated — the `string | null` type leaves room for a future
 * pattern-based "unrecognized certification" signal that is out of scope
 * here.
 */
export function extractCertifications(text: string): readonly CertificationAttribute[] {
  if (text.length === 0) return [];

  const claimed = new Array<boolean>(text.length).fill(false);
  const found: CertificationAttribute[] = [];

  for (const { term, canonicalId, isExact } of GAZETTEER) {
    // Unicode-aware boundary (H-028 D3, same root cause as extractSkills):
    // an ASCII-only guard treats every accented letter as a word boundary,
    // so a certification abbreviation could spuriously match adjacent to a
    // non-English name. No certification surface form here is short enough
    // (all are 3+ characters) to need the additional list-context guard
    // `extractSkills` applies to single/double-character skill terms.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      // Every gazetteer term is non-empty, so `match[0]` can never be
      // zero-length here — see the identical note in extractSkills.
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
      const confidence = quantize(isExact ? EXACT_CONFIDENCE : ALIAS_CONFIDENCE);
      const sourceSpan = { start, end };
      assertValidSpan(text, sourceSpan, value);

      found.push({
        kind: 'certification',
        value,
        normalizedValue: canonicalId,
        confidence,
        sourceSpan,
        canonicalId,
      });
    }
  }

  return found.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
