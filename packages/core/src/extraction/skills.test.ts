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

  describe('confidence arithmetic and the in-section bonus (mutation coverage)', () => {
    // Pins the exact constants (0.95 canonical, 0.80 alias, +0.05 in-section,
    // capped at 1.0) rather than a mere ordering ("greater than"), and does so
    // for the SAME skill mentioned both inside and outside a real detected
    // "Skills" section within one document — so a mutant that always applies
    // (or never applies) the bonus, or that swaps min/max or +/- in the bonus
    // arithmetic, cannot pass by accident. The in-section mention lands at
    // exactly 0.95 + 0.05 = 1.00, genuinely exercising the cap rather than
    // just approaching it.
    it('applies the +0.05 bonus only to the mention inside the Skills section, and the cap lands exactly at 1.0', () => {
      const text =
        'Skills\nPostgreSQL\n\nSummary\nI have also used PostgreSQL extensively before switching teams.';
      const attrs = extractSkills(text);
      const pg = attrs.filter((a) => a.canonicalId === 'postgresql');
      expect(pg).toHaveLength(2);
      const [inSection, outOfSection] = pg;
      if (inSection === undefined || outOfSection === undefined) {
        throw new Error('unreachable: asserted length above');
      }
      expect(inSection.sourceSpan.start).toBeLessThan(outOfSection.sourceSpan.start);
      expect(inSection.confidence).toBe(1);
      expect(outOfSection.confidence).toBe(0.95);
    });

    // Same pin, but for an ALIAS match (0.80 base) rather than a canonical
    // one (0.95 base) — the bonus and the base are independent constants and
    // a mutant could corrupt either without the exact-match test above
    // noticing.
    it('applies the +0.05 bonus to an alias match too: 0.85 inside, 0.80 outside', () => {
      const text = 'Skills\nPostgres\n\nSummary\nI mentioned Postgres again casually here.';
      const attrs = extractSkills(text);
      const postgresMatches = attrs.filter(
        (a) => a.canonicalId === 'postgresql' && a.value === 'Postgres',
      );
      expect(postgresMatches).toHaveLength(2);
      const [inSection, outOfSection] = postgresMatches;
      if (inSection === undefined || outOfSection === undefined) {
        throw new Error('unreachable: asserted length above');
      }
      expect(inSection.confidence).toBe(0.85);
      expect(outOfSection.confidence).toBe(0.8);
    });

    // The section-bonus boundary check (`start >= s.start && end <= s.end`)
    // must be a genuine CONTAINMENT test, not merely "a skills section exists
    // somewhere in the document". A document where the Skills section comes
    // FIRST and the out-of-section mention comes after it means the mention's
    // start is trivially >= the section's start (0) — a mutant that drops the
    // `end <= s.end` half of the check, or ORs the two halves together, would
    // wrongly grant the bonus here. This is the "both directions in one
    // document" case with the section leading.
    it('does not grant the section bonus to a mention that comes after the Skills section', () => {
      const text = 'Skills\nDocker\n\nSummary\nI also used PostgreSQL occasionally in prior work.';
      const attrs = extractSkills(text);
      const pg = attrs.find((a) => a.canonicalId === 'postgresql');
      expect(pg).toBeDefined();
      expect(pg?.confidence).toBe(0.95);
    });

    // Mirror case with the ordering reversed: the out-of-section mention
    // comes BEFORE the Skills section. Here the mention's end is trivially <=
    // the section's end (since the skills section is the last thing in the
    // document and its own `end` is `text.length`) — a mutant that drops the
    // `start >= s.start` half of the check would wrongly grant the bonus
    // here. Together with the previous test, both halves of the containment
    // check are independently exercised.
    it('does not grant the section bonus to a mention that comes before the Skills section', () => {
      const text = 'Summary\nI enjoy PostgreSQL work.\n\nSkills\nDocker';
      const attrs = extractSkills(text);
      const pg = attrs.find((a) => a.canonicalId === 'postgresql');
      expect(pg).toBeDefined();
      expect(pg?.confidence).toBe(0.95);
    });

    // The IMPLIES pass (H-028 D2) has its own, separate section-bonus
    // computation (a second copy of the min/+/cap arithmetic). Pin it
    // independently: inside a Skills section the implied skill lands at
    // exactly 0.80 + 0.05 = 0.85, and the specific mention it was implied
    // from is boosted the same way.
    it('boosts both the specific and the implied skill when the mention is inside a Skills section', () => {
      const text = 'Skills\nRuby on Rails';
      const attrs = extractSkills(text);
      const rails = attrs.find((a) => a.canonicalId === 'rails');
      const ruby = attrs.find((a) => a.canonicalId === 'ruby');
      expect(rails?.confidence).toBe(1); // 0.95 + 0.05, capped at 1.0
      expect(ruby?.confidence).toBe(0.85); // 0.80 + 0.05
    });

    // Same IMPLIES pass, but with the mention OUTSIDE the Skills section
    // even though a (different) Skills section exists elsewhere in the
    // document — so the bonus computation must check containment for the
    // implied skill too, not just "some skills section exists" (which would
    // make `.some(() => true)`-style mutants pass unnoticed).
    it('does not boost the implied skill when the mention is outside the Skills section', () => {
      const text =
        'Skills\nDocker\n\nExperience\nI used Ruby on Rails during a summer internship, unrelated to my main stack.';
      const attrs = extractSkills(text);
      const rails = attrs.find((a) => a.canonicalId === 'rails');
      const ruby = attrs.find((a) => a.canonicalId === 'ruby');
      expect(rails?.confidence).toBe(0.95);
      expect(ruby?.confidence).toBe(0.8);
    });
  });

  describe('longest-first gazetteer matching (mutation coverage)', () => {
    // "SQL Server" (10-char normalized alias-of-a-label) is longer than the
    // standalone "SQL" (3 chars, a different canonical id). Longest-first
    // means "SQL Server" claims the whole span first, so the 3-char "sql"
    // gazetteer term can never separately match at the same position. The
    // `sql` attribute that DOES appear here must therefore come from the
    // IMPLIES pass (H-028 D2), not from an independent direct match — proven
    // by its span and value being identical to the specific "SQL Server"
    // mention's, and its matchType being 'alias' rather than a second
    // 'exact'/'alias' hit at a shorter span.
    it('does not separately match the shorter "sql" inside "SQL Server"', () => {
      const text = 'Skills: SQL Server';
      const attrs = extractSkills(text);
      const sqlServer = attrs.find((a) => a.canonicalId === 'sql-server');
      const sql = attrs.find((a) => a.canonicalId === 'sql');
      expect(sqlServer).toBeDefined();
      expect(sql).toBeDefined();
      if (sqlServer === undefined || sql === undefined) {
        throw new Error('unreachable: asserted above');
      }
      // Only one gazetteer-level match claims this span: "SQL Server".
      expect(sqlServer.sourceSpan).toEqual(sql.sourceSpan);
      expect(sql.value).toBe('SQL Server');
      // A genuinely separate direct match on "SQL" would have its own
      // 3-character span distinct from "SQL Server"'s 10-character one.
      expect(sql.sourceSpan.end - sql.sourceSpan.start).toBe('SQL Server'.length);
    });
  });

  describe('word-boundary punctuation adjacency (mutation coverage)', () => {
    // Every ordinary (non-ambiguous-short) gazetteer term must still match
    // when directly touching a comma, slash, parenthesis or newline — the
    // Unicode-aware boundary guard treats all of these as valid delimiters,
    // and this exercises five different adjacency shapes in one pass.
    it('matches skills immediately touching commas, a slash, parentheses and a newline', () => {
      const text = 'Skills: Docker, Kubernetes/AWS (Terraform)\nPostgreSQL';
      const attrs = extractSkills(text);
      // Skills appear in the same left-to-right order as in the source text,
      // so this also implicitly checks stable ordering rather than needing
      // an unordered-set comparison.
      const ids = attrs.map((a) => a.canonicalId);
      expect(ids).toEqual(['docker', 'kubernetes', 'aws', 'terraform', 'postgresql']);
      // Every span must cover exactly the surface text it claims to,
      // including these punctuation-adjacent matches.
      for (const attr of attrs) {
        expect(text.slice(attr.sourceSpan.start, attr.sourceSpan.end)).toBe(attr.value);
      }
    });
  });

  describe('stable ordering by source position (mutation coverage)', () => {
    // Beyond mere determinism (repeated calls agree with each other), the
    // result must actually be sorted ascending by where each match starts in
    // the original text — pinning this directly guards the final sort
    // comparator, not just its stability across runs.
    it('returns attributes in strictly non-decreasing sourceSpan.start order', () => {
      const text = 'PostgreSQL, Python, Docker, Kubernetes, React, TypeScript, AWS, Terraform.';
      const attrs = extractSkills(text);
      expect(attrs.length).toBeGreaterThan(0);
      for (let i = 1; i < attrs.length; i += 1) {
        const prev = attrs[i - 1];
        const curr = attrs[i];
        if (prev === undefined || curr === undefined) throw new Error('unreachable');
        expect(curr.sourceSpan.start).toBeGreaterThanOrEqual(prev.sourceSpan.start);
      }
    });
  });

  describe('hasListContext boundary internals for ambiguous short terms (mutation coverage)', () => {
    // These pin the internal delimiter/whitespace-skipping logic that guards
    // single- and double-character skills (H-028 D3). Each case is built so
    // that exactly ONE side (before or after) of the term is the thing
    // deciding the outcome, and the other side is a plain letter that gives
    // no list-like signal — isolating each branch of the OR/AND chains so a
    // mutant flipping any single comparison is caught rather than masked by
    // the other side already agreeing.

    it('treats the very start of the document as valid list context (no comma needed)', () => {
      // Nothing precedes "R" at all — `before`/`nearestBefore` is `undefined`,
      // which `isListDelimiter` must treat as a boundary. The word after is
      // an ordinary letter, so this only passes if the undefined-start path
      // itself is doing the work.
      expect(extractSkills('R is a language').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('recognizes a comma as list context on the trailing side only', () => {
      // "know" (a real word ending in a letter) sits before "R", giving a
      // definitively non-delimiter `nearestBefore`; only the trailing comma
      // can make this match.
      expect(extractSkills('I know R, and stuff').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('recognizes a semicolon as list context on the trailing side only', () => {
      expect(extractSkills('I know R; and stuff').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('recognizes a pipe as list context on the trailing side only', () => {
      expect(extractSkills('I know R| and stuff').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('recognizes a colon as list context on the trailing side only', () => {
      expect(extractSkills('I know R: and stuff').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('recognizes a newline as list context on the trailing side only', () => {
      expect(extractSkills('I know R\nand stuff').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('rejects a standalone term with an ordinary word on both sides and no delimiter anywhere', () => {
      // Negative counterpart to the six cases above: neither side gives any
      // list-like signal, so this must be rejected. This single case also
      // catches any mutant that makes the leading/trailing whitespace-skip
      // loops "run off the end" of the string (which would make the nearest
      // character on that side spuriously `undefined`, and `undefined` is
      // itself treated as a delimiter — turning this false into a true).
      expect(extractSkills('cat R more').some((a) => a.canonicalId === 'r')).toBe(false);
      expect(extractSkills('cat  R more').some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('skips over trailing spaces to find a comma further away', () => {
      expect(extractSkills('cat R  ,dog').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('skips over a trailing tab (not just spaces) to find a comma further away', () => {
      expect(extractSkills('cat R\t,dog').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('skips over a leading tab (not just spaces) to find a comma further away', () => {
      expect(extractSkills('Python,\tR and stuff').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('treats a single leading space before the term, at the very start of the document, as valid list context', () => {
      // Exercises the off-by-one boundary of the backward whitespace-skip
      // loop: it must skip past index 0, not stop one character early.
      expect(extractSkills(' R and Python').some((a) => a.canonicalId === 'r')).toBe(true);
    });

    it('does not treat a lone leading symbol (no delimiter, no whitespace to skip) as list context', () => {
      // The character immediately before "R" is neither whitespace (nothing
      // to skip) nor a list delimiter, so this must be rejected — the
      // mirror off-by-one case to the previous test.
      expect(extractSkills('*R and Python').some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('rejects an ambiguous term directly preceded by a hyphen even when a real delimiter follows', () => {
      // H-028 D3 extended: the attached-punctuation guard must fire on the
      // BEFORE side too (existing coverage only exercises it on the AFTER
      // side, e.g. "Go-to-market"). The trailing comma is a real delimiter
      // that would otherwise make this match, so this specifically pins that
      // the before-guard is an unconditional early rejection, not something
      // the trailing comma can override.
      expect(extractSkills('Non-R, other').some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('rejects an ambiguous term directly followed by an ampersand at the very start of the document', () => {
      // Placed at document start (where `before` is `undefined`, which on
      // its own would normally satisfy list context) to prove the
      // attached-punctuation guard is checked and short-circuits BEFORE the
      // undefined-start path can grant a match.
      expect(extractSkills('R& friends invited').some((a) => a.canonicalId === 'r')).toBe(false);
    });

    it('rejects an ambiguous term directly followed by a curly apostrophe (possessive) at document start', () => {
      expect(extractSkills('R’s work was excellent').some((a) => a.canonicalId === 'r')).toBe(
        false,
      );
    });

    it('rejects an ambiguous term directly followed by an en dash at document start', () => {
      expect(extractSkills('R–based tools were used').some((a) => a.canonicalId === 'r')).toBe(
        false,
      );
    });

    it('rejects an ambiguous term directly followed by an em dash at document start', () => {
      expect(
        extractSkills('R—not Python—was the language').some((a) => a.canonicalId === 'r'),
      ).toBe(false);
    });
  });
});
