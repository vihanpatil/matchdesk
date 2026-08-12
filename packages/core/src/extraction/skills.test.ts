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

  describe('single-character/short-term false positives (H-028 D3)', () => {
    it('does not match "r" inside an accented name like "Rémi Dubois"', () => {
      const attrs = extractSkills('Rémi Dubois');
      expect(attrs.some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('does not match "r" inside "Résumé"', () => {
      const attrs = extractSkills('Résumé');
      expect(attrs.some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('does not match "r" in "Led R&D for payments"', () => {
      const attrs = extractSkills('Led R&D for payments');
      expect(attrs.some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('does not match "c" in "C\'est la vie"', () => {
      const attrs = extractSkills("C'est la vie");
      expect(attrs.some((a) => a.canonicalId === 'c')).toBe(false);
    });

    it('does not match "go" in "Go-to-market strategy"', () => {
      const attrs = extractSkills('Go-to-market strategy');
      expect(attrs.some((a) => a.canonicalId === 'go')).toBe(false);
    });

    it('still matches a genuine standalone "R" in a comma-delimited skills list', () => {
      const attrs = extractSkills('Skills: R, Python, Docker');
      expect(attrs.some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('still matches a genuine standalone "Go" in a comma-delimited skills list', () => {
      const attrs = extractSkills('Skills: Go, Python, Docker');
      expect(attrs.some((a) => a.canonicalId === 'go')).toBe(true);
    });

    it('still matches "C" on its own line in a skills list', () => {
      const attrs = extractSkills(['Skills', 'C, Python, Docker'].join('\n'));
      expect(attrs.some((a) => a.canonicalId === 'c')).toBe(true);
    });
  });

  describe('genuinely-implied shorter skills (H-028 D2)', () => {
    it('emits both "rails" and the implied "ruby" for "Ruby on Rails"', () => {
      const attrs = extractSkills('Skills: Ruby on Rails');
      const ids = attrs.map((a) => a.canonicalId);
      expect(ids).toContain('rails');
      expect(ids).toContain('ruby');
    });

    it('emits both "sql-server" and the implied "sql" for "SQL Server"', () => {
      const attrs = extractSkills('Skills: SQL Server');
      const ids = attrs.map((a) => a.canonicalId);
      expect(ids).toContain('sql-server');
      expect(ids).toContain('sql');
    });

    it('emits both "spring-boot" and the implied "spring" for "Spring Boot"', () => {
      const attrs = extractSkills('Skills: Spring Boot');
      const ids = attrs.map((a) => a.canonicalId);
      expect(ids).toContain('spring-boot');
      expect(ids).toContain('spring');
    });

    it('emits both "github-actions" and the implied "github" for "GitHub Actions"', () => {
      const attrs = extractSkills('Skills: GitHub Actions');
      const ids = attrs.map((a) => a.canonicalId);
      expect(ids).toContain('github-actions');
      expect(ids).toContain('github');
    });

    it('the implied skill carries a valid span pointing at the specific mention', () => {
      const text = 'Skills: Ruby on Rails';
      const attrs = extractSkills(text);
      const implied = attrs.find((a) => a.canonicalId === 'ruby');
      expect(implied).toBeDefined();
      if (implied === undefined) throw new Error('unreachable: asserted above');
      expect(() => {
        assertValidSpan(text, implied.sourceSpan, implied.value);
      }).not.toThrow();
    });

    it('does NOT imply "c" from "C Sharp" — C# is a different language from C', () => {
      const attrs = extractSkills('Skills: C Sharp');
      expect(attrs.some((a) => a.canonicalId === 'c')).toBe(false);
      expect(attrs.some((a) => a.canonicalId === 'csharp')).toBe(true);
    });

    it('does NOT imply "java" from "JavaScript"', () => {
      const attrs = extractSkills('Skills: JavaScript');
      expect(attrs.some((a) => a.canonicalId === 'java')).toBe(false);
      expect(attrs.some((a) => a.canonicalId === 'javascript')).toBe(true);
    });

    it('does not duplicate "ruby" when both "Ruby" and "Ruby on Rails" are already present', () => {
      const attrs = extractSkills('Skills: Ruby, Ruby on Rails');
      const rubyMatches = attrs.filter((a) => a.canonicalId === 'ruby');
      expect(rubyMatches).toHaveLength(1);
    });
  });
});
