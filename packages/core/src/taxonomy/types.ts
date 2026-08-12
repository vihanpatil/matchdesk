/**
 * Versioned skills taxonomy — typed data (Section 2 of the engine task).
 *
 * Shape: canonical skill -> aliases[] -> category -> related canonical
 * skills[]. Pure data; no logic lives in this file.
 */

/** Broad grouping used for gazetteer scanning and UI faceting. */
export type SkillCategory =
  | 'language'
  | 'framework'
  | 'database'
  | 'cloud'
  | 'devops'
  | 'data'
  | 'testing'
  | 'design'
  | 'methodology'
  | 'tool'
  | 'business';

/**
 * One canonical skill entry.
 *
 * `id` is the canonical identifier: lowercase, stable, never renamed once
 * published (a taxonomy version bump is required to rename one). `aliases`
 * are alternative surface forms a candidate or job might use, already
 * lowercased. `related` lists OTHER canonical ids this skill is adjacent to
 * (cascade step 3, "taxonomy-related"). Related is intentionally NOT always
 * symmetric in the source data — `postgresql` relates to `sql`, but `sql`
 * relates to many databases — so lookup treats it as directed and the
 * cascade checks both directions explicitly where that matters.
 */
export interface TaxonomyEntry {
  readonly id: string;
  readonly label: string;
  readonly category: SkillCategory;
  readonly aliases: readonly string[];
  readonly related: readonly string[];
}

export interface Taxonomy {
  readonly version: string;
  readonly entries: readonly TaxonomyEntry[];
}
