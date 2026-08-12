import { describe, expect, it } from 'vitest';

import { aliasesOf, canonicalize, getEntry, relatedTo } from './lookup.js';

describe('canonicalize', () => {
  it('resolves a canonical id typed verbatim', () => {
    expect(canonicalize('postgresql')).toBe('postgresql');
  });

  it('resolves a known alias to its canonical id', () => {
    expect(canonicalize('postgres')).toBe('postgresql');
    expect(canonicalize('psql')).toBe('postgresql');
    expect(canonicalize('pg')).toBe('postgresql');
  });

  it('is case-insensitive without using toLocaleLowerCase', () => {
    expect(canonicalize('PostgreSQL')).toBe('postgresql');
    expect(canonicalize('POSTGRES')).toBe('postgresql');
    expect(canonicalize('PoStGrEs')).toBe('postgresql');
  });

  it('trims surrounding whitespace and collapses internal whitespace', () => {
    expect(canonicalize('  postgres  ')).toBe('postgresql');
    expect(canonicalize('scikit   learn')).toBe('scikit-learn');
  });

  it('returns null for a term with no match', () => {
    expect(canonicalize('quantum-flux-analysis')).toBeNull();
  });

  it('returns null for an empty or whitespace-only term', () => {
    expect(canonicalize('')).toBeNull();
    expect(canonicalize('   ')).toBeNull();
  });

  it('resolves aliases containing symbols like c++ and c#', () => {
    expect(canonicalize('C++')).toBe('cpp');
    expect(canonicalize('c#')).toBe('csharp');
  });

  it('is deterministic across repeated calls', () => {
    const results = new Set(Array.from({ length: 50 }, () => canonicalize('Postgres')));
    expect(results.size).toBe(1);
  });
});

describe('aliasesOf', () => {
  it('returns the aliases of a known canonical id', () => {
    expect(aliasesOf('postgresql').toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      'pg',
      'postgres',
      'psql',
    ]);
  });

  it('returns an empty array for a canonical id with no aliases', () => {
    expect(aliasesOf('java')).toEqual([]);
  });

  it('returns an empty array for an unknown canonical id, deterministically', () => {
    expect(aliasesOf('not-a-real-skill')).toEqual([]);
  });

  it('is case-insensitive on the canonical id itself', () => {
    expect(aliasesOf('PostgreSQL').toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      'pg',
      'postgres',
      'psql',
    ]);
  });
});

describe('relatedTo', () => {
  it('returns the related canonical ids for a known skill', () => {
    expect(relatedTo('postgresql')).toEqual(['sql']);
  });

  it('returns an empty array for an unknown canonical id', () => {
    expect(relatedTo('not-a-real-skill')).toEqual([]);
  });

  it('is case-insensitive on the canonical id itself', () => {
    expect(relatedTo('POSTGRESQL')).toEqual(['sql']);
  });
});

describe('getEntry', () => {
  it('returns the full entry for a known canonical id', () => {
    const entry = getEntry('postgresql');
    expect(entry?.label).toBe('PostgreSQL');
    expect(entry?.category).toBe('database');
  });

  it('returns null for an unknown canonical id', () => {
    expect(getEntry('not-a-real-skill')).toBeNull();
  });
});
