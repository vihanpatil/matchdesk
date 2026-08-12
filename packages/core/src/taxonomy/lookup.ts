import { TAXONOMY } from './data.js';
import type { TaxonomyEntry } from './types.js';

/**
 * Normalizes a raw term the same way every alias/id in the taxonomy is
 * stored: lowercased (via `toLowerCase`, never `toLocaleLowerCase` — Section
 * 6.6 bans locale-dependent behaviour), trimmed, and with internal
 * whitespace collapsed to single spaces so "node   js" and "node js" resolve
 * identically.
 */
function normalize(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** id/alias (normalized) -> canonical id. Built once at module load. */
const BY_TERM: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const entry of TAXONOMY.entries) {
    map.set(normalize(entry.id), entry.id);
    for (const alias of entry.aliases) {
      map.set(normalize(alias), entry.id);
    }
  }
  return map;
})();

/** canonical id (normalized) -> full entry. */
const BY_ID: ReadonlyMap<string, TaxonomyEntry> = (() => {
  const map = new Map<string, TaxonomyEntry>();
  for (const entry of TAXONOMY.entries) {
    map.set(normalize(entry.id), entry);
  }
  return map;
})();

/**
 * Resolves any surface form (canonical id, alias, arbitrary casing/spacing)
 * to its canonical taxonomy id. Deterministic and case-insensitive.
 *
 * @returns the canonical id, or `null` if the term matches nothing.
 */
export function canonicalize(term: string): string | null {
  const key = normalize(term);
  if (key.length === 0) return null;
  return BY_TERM.get(key) ?? null;
}

/** Full taxonomy entry for a canonical id (case-insensitive), or `null`. */
export function getEntry(canonicalId: string): TaxonomyEntry | null {
  return BY_ID.get(normalize(canonicalId)) ?? null;
}

/**
 * Alternative surface forms for a canonical skill. Empty array for an
 * unknown id — never throws, since "no aliases known" and "id not found"
 * are both legitimately representable as "nothing to report" here.
 */
export function aliasesOf(canonicalId: string): readonly string[] {
  return getEntry(canonicalId)?.aliases ?? [];
}

/** Canonical ids this skill is taxonomy-related to (cascade step 3). */
export function relatedTo(canonicalId: string): readonly string[] {
  return getEntry(canonicalId)?.related ?? [];
}
