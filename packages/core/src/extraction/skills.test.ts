import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractSkills } from './skills.js';

describe('extractSkills', () => {
  it('finds an exact canonical-id mention with matchType "exact"', () => {
    const text = 'Experienced with PostgreSQL in production.';
    const attrs = extractSkills(text);
    const pg = attrs.find((a) => a.canonicalId === 'postgresql');
    expect(pg).toBeDefined();
    expect(pg?.matchType).toBe('exact');
    expect(pg?.value).toBe('PostgreSQL');
    expect(text.slice(pg?.sourceSpan.start ?? 0, pg?.sourceSpan.end ?? 0)).toBe('PostgreSQL');
  });

  it('finds an alias mention with matchType "alias" and lower confidence than exact', () => {
    const text = 'Comfortable with Postgres and psql at the command line.';
    const attrs = extractSkills(text);
    const pg = attrs.find((a) => a.normalizedValue === 'postgresql' && a.value === 'Postgres');
    expect(pg).toBeDefined();
    expect(pg?.matchType).toBe('alias');

    const exactText = 'PostgreSQL is great.';
    const exactAttrs = extractSkills(exactText);
    const exactPg = exactAttrs.find((a) => a.canonicalId === 'postgresql');
    expect(exactPg?.confidence).toBeGreaterThan(pg?.confidence ?? 1);
  });

  it('every emitted attribute carries a span that is valid and matches the surface text', () => {
    const text = 'Skills: PostgreSQL, Python, Docker, Kubernetes, React and TypeScript.';
    const attrs = extractSkills(text);
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('prefers the longest match and does not double-count an overlapping shorter alias', () => {
    // "node.js" contains "node" as a substring/alias; only the longer canonical
    // term should be reported for that exact span.
    const text = 'Built services with Node.js.';
    const attrs = extractSkills(text);
    const nodeMatches = attrs.filter((a) => a.canonicalId === 'nodejs');
    expect(nodeMatches).toHaveLength(1);
    expect(nodeMatches[0]?.value).toBe('Node.js');
  });

  it('does not match a skill term embedded inside an unrelated word', () => {
    // "Go" the language must not match inside "Google" or "going".
    const text = 'We are going to Google Cloud for this project.';
    const attrs = extractSkills(text);
    expect(attrs.some((a) => a.canonicalId === 'go')).toBe(false);
    expect(attrs.some((a) => a.canonicalId === 'gcp')).toBe(true);
  });

  it('is case-insensitive', () => {
    const text = 'DOCKER and kubernetes and Docker again.';
    const attrs = extractSkills(text);
    expect(attrs.filter((a) => a.canonicalId === 'docker')).toHaveLength(2);
  });

  it('returns an empty array when nothing in the taxonomy is mentioned', () => {
    expect(extractSkills('The quick brown fox jumps over the lazy dog.')).toEqual([]);
  });

  it('returns an empty array for empty text', () => {
    expect(extractSkills('')).toEqual([]);
  });

  it('boosts confidence for a mention inside a detected Skills section', () => {
    const inSection = 'Skills\nPostgreSQL';
    const outOfSection = 'I mention PostgreSQL once in passing during a summary.';
    const inAttr = extractSkills(inSection).find((a) => a.canonicalId === 'postgresql');
    const outAttr = extractSkills(outOfSection).find((a) => a.canonicalId === 'postgresql');
    expect(inAttr?.confidence).toBeGreaterThan(outAttr?.confidence ?? 1);
  });

  it('is deterministic: repeated calls on the same input yield identical results', () => {
    const text = 'PostgreSQL, Python, Docker, Kubernetes, React, TypeScript, AWS, Terraform.';
    const first = extractSkills(text);
    const second = extractSkills(text);
    expect(second).toEqual(first);
  });
});
