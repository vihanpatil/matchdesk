import { describe, expect, it } from 'vitest';

import { TAXONOMY } from './data.js';

describe('TAXONOMY seed data', () => {
  it('has a stable version string', () => {
    expect(TAXONOMY.version).toBe('1.0.0');
  });

  it('covers a solid vocabulary: between 80 and 120 canonical skills', () => {
    expect(TAXONOMY.entries.length).toBeGreaterThanOrEqual(80);
    expect(TAXONOMY.entries.length).toBeLessThanOrEqual(120);
  });

  it('has no duplicate canonical ids', () => {
    const ids = TAXONOMY.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every canonical id is already lowercase', () => {
    for (const entry of TAXONOMY.entries) {
      expect(entry.id).toBe(entry.id.toLowerCase());
    }
  });

  it('every alias is already lowercase and trimmed', () => {
    for (const entry of TAXONOMY.entries) {
      for (const alias of entry.aliases) {
        expect(alias).toBe(alias.toLowerCase());
        expect(alias).toBe(alias.trim());
        expect(alias.length).toBeGreaterThan(0);
      }
    }
  });

  it('no alias collides with any canonical id (including its own entry)', () => {
    const ids = new Set(TAXONOMY.entries.map((e) => e.id));
    for (const entry of TAXONOMY.entries) {
      for (const alias of entry.aliases) {
        expect(ids.has(alias)).toBe(false);
      }
    }
  });

  it('no alias is claimed by more than one canonical entry', () => {
    const owner = new Map<string, string>();
    for (const entry of TAXONOMY.entries) {
      for (const alias of entry.aliases) {
        const existing = owner.get(alias);
        expect(
          existing,
          `alias "${alias}" claimed by both ${String(existing)} and ${entry.id}`,
        ).toBeUndefined();
        owner.set(alias, entry.id);
      }
    }
  });

  it('every related id points at a canonical id that actually exists', () => {
    const ids = new Set(TAXONOMY.entries.map((e) => e.id));
    for (const entry of TAXONOMY.entries) {
      for (const relatedId of entry.related) {
        expect(ids.has(relatedId), `${entry.id} relates to unknown id "${relatedId}"`).toBe(true);
      }
    }
  });

  it('no entry lists itself as related', () => {
    for (const entry of TAXONOMY.entries) {
      expect(entry.related).not.toContain(entry.id);
    }
  });

  it('covers languages, frameworks, databases, cloud, data and business categories', () => {
    const categories = new Set(TAXONOMY.entries.map((e) => e.category));
    for (const required of ['language', 'framework', 'database', 'cloud', 'data', 'business']) {
      expect(categories.has(required as never)).toBe(true);
    }
  });

  it('includes the worked example from the task: postgresql with postgres/psql/pg aliases related to sql', () => {
    const pg = TAXONOMY.entries.find((e) => e.id === 'postgresql');
    expect(pg).toBeDefined();
    expect(pg?.aliases.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      'pg',
      'postgres',
      'psql',
    ]);
    expect(pg?.related).toContain('sql');
  });
});
