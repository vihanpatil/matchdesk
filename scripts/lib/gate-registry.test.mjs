import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeGate, headingIds, validateRegistry } from './gate-registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** @typedef {import('./gate-registry.mjs').Finding} Finding */

/** @type {(over?: Partial<Finding>) => Finding} */
const finding = (over = {}) => ({ id: 'H-999', severity: 'process', status: 'closed', ...over });

describe('headingIds', () => {
  it('picks up H- and D- headings in the log’s exact shape', () => {
    const md = ['### H-041 · Something', '### D7 · Another', '## H-050 · wrong level'].join('\n');
    expect([...headingIds(md)]).toEqual(['H-041', 'D7']);
  });

  it('does NOT match a prose mention of an id', () => {
    // If this matched, the completeness check below would be vacuous — every
    // id would appear "in the log" merely by being discussed. That is the
    // H-060 shape: a guard that cannot fail.
    const md = 'See H-041 for detail, and ### H-041 is not a heading here either.\n';
    expect(headingIds(md).size).toBe(0);
  });

  it('tolerates tabs and extra spaces after the hashes', () => {
    expect([...headingIds('###\t H-002 \t· x')]).toEqual(['H-002']);
  });
});

describe('validateRegistry', () => {
  it('accepts a sound registry', () => {
    const findings = [finding({ id: 'H-001' })];
    expect(validateRegistry(findings, new Set(['H-001']))).toEqual([]);
  });

  it('FAILS when the log has a finding the registry does not', () => {
    // The check that matters: H-004 and H-044 are both cases of a registry
    // quietly covering less than it appeared to.
    const problems = validateRegistry([finding({ id: 'H-001' })], new Set(['H-001', 'H-002']));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('H-002');
    expect(problems[0]).toContain('MISSING from findings.json');
  });

  it('FAILS when the registry has an entry with no log heading and no note', () => {
    const problems = validateRegistry([finding({ id: 'D7' })], new Set());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('D7');
  });

  it('allows a registry-only entry when it explains itself', () => {
    // D7 is a real case: an H-028 sub-item with no heading of its own.
    const problems = validateRegistry([finding({ id: 'D7', note: 'H-028 sub-item' })], new Set());
    expect(problems).toEqual([]);
  });

  it('rejects a duplicate id', () => {
    const problems = validateRegistry([finding(), finding()], new Set(['H-999']));
    expect(problems.some((p) => p.includes('listed twice'))).toBe(true);
  });

  it('rejects an unknown severity or status', () => {
    const bad = /** @type {Finding} */ (
      /** @type {unknown} */ ({ id: 'H-001', severity: 'spicy', status: 'ajar' })
    );
    const problems = validateRegistry([bad], new Set(['H-001']));
    expect(problems.some((p) => p.includes('bad severity'))).toBe(true);
    expect(problems.some((p) => p.includes('bad status'))).toBe(true);
  });

  it('requires an unclassified entry to say why', () => {
    const problems = validateRegistry(
      [finding({ severity: 'unclassified', status: 'open' })],
      new Set(['H-999']),
    );
    expect(problems.some((p) => p.includes('must carry a note'))).toBe(true);
  });

  it('reports an entry with no id rather than crashing', () => {
    const bad = /** @type {Finding} */ (/** @type {unknown} */ ({ severity: 'process' }));
    expect(validateRegistry([bad], new Set())).toEqual([expect.stringContaining('no id')]);
  });
});

describe('computeGate', () => {
  it('E5 passes when nothing open is wrong-score or unclassified', () => {
    const gate = computeGate([
      finding({ id: 'H-001', severity: 'wrong-score', status: 'closed' }),
      finding({ id: 'H-002', severity: 'coverage-gap', status: 'open' }),
    ]);
    expect(gate.e5).toBe(true);
    expect(gate.blockingE5).toEqual([]);
  });

  it('an OPEN wrong-score finding blocks E5', () => {
    const gate = computeGate([finding({ severity: 'wrong-score', status: 'open' })]);
    expect(gate.e5).toBe(false);
  });

  it('an UNCLASSIFIED finding blocks E5 too', () => {
    // Deliberate. A finding nobody triaged is not evidence of safety —
    // treating it as non-blocking is the assumption H-055 made and H-063
    // caught. This assertion is the whole reason `unclassified` exists.
    const gate = computeGate([
      finding({ severity: 'unclassified', status: 'open', note: 'never triaged' }),
    ]);
    expect(gate.e5).toBe(false);
    expect(gate.blockingE5).toHaveLength(1);
  });

  it('E2 cannot pass while E5 fails', () => {
    const gate = computeGate([finding({ severity: 'wrong-score', status: 'open' })]);
    expect(gate.e2).toBe(false);
  });

  it('false-refusal and coverage-gap never block, per ADR-023', () => {
    const gate = computeGate([
      finding({ id: 'H-001', severity: 'false-refusal', status: 'open' }),
      finding({ id: 'H-002', severity: 'coverage-gap', status: 'open' }),
      finding({ id: 'H-003', severity: 'integrity', status: 'open' }),
    ]);
    expect(gate.e5).toBe(true);
  });

  it('counts open findings by severity', () => {
    const gate = computeGate([
      finding({ id: 'H-001', severity: 'process', status: 'open' }),
      finding({ id: 'H-002', severity: 'process', status: 'open' }),
      finding({ id: 'H-003', severity: 'process', status: 'closed' }),
    ]);
    expect(gate.openBySeverity).toEqual({ process: 2 });
    expect(gate.openCount).toBe(2);
    expect(gate.totalCount).toBe(3);
  });
});

describe('the REAL registry, as shipped', () => {
  /** @type {{ findings: Finding[] }} */
  const registry = JSON.parse(readFileSync(join(ROOT, 'docs/findings.json'), 'utf8'));
  const logIds = headingIds(readFileSync(join(ROOT, 'HONESTY_LOG.md'), 'utf8'));

  it('is sound — every log finding is registered and every entry is well-formed', () => {
    expect(validateRegistry(registry.findings, logIds)).toEqual([]);
  });

  it('records H-041 as CLOSED, and still as wrong-score', () => {
    // The severity stays `wrong-score`. It was reclassified once already
    // (ADR-027, from the opposite direction) and the temptation on the way out
    // is to soften the label rather than close the defect. What closed it is
    // ADR-034: the engine no longer asserts a must-have unmet while holding
    // text it could not read.
    const h041 = registry.findings.find((f) => f.id === 'H-041');
    expect(h041).toMatchObject({ severity: 'wrong-score', status: 'closed' });
  });

  it('E5 is MET at HEAD, with every wrong-score finding closed', () => {
    // This assertion has been flipped SEVEN times, and it was worth every one.
    //   ['H-002','H-040','H-041'] -> ['H-040','H-041'] -> ['H-041']
    //   -> ['H-041','H-089'] -> ['H-041','H-089','H-095'] -> eight -> ['H-041']
    //   -> [].
    //
    // Five of those moves made the gate HARDER, every one because somebody
    // measured rather than reasoned. Reaching zero is not the interesting part;
    // the interesting part is that the count went UP three times on the way,
    // and that H-041 - open across five sessions - was finally closed by
    // abandoning the approach its own name implied. It was never really a
    // language-detection defect: it was the engine asserting a NEGATIVE from
    // silence (ADR-034).
    //
    // If a future change flips this back, that is the system working. Do not
    // reach for the severity field to make it green again - that is the loop
    // ADR-028 exists to end.
    const gate = computeGate(registry.findings);
    expect(gate.e5).toBe(true);
    expect(gate.blockingE5).toEqual([]);
  });

  it('every remaining E5 blocker is a measured defect, not an untriaged one', () => {
    // The registry's job was to empty the untriaged set. This asserts it did,
    // so `unclassified` reappearing is a visible regression rather than a
    // slow accumulation nobody notices.
    const gate = computeGate(registry.findings);
    expect(gate.blockingE5.every((f) => f.severity === 'wrong-score')).toBe(true);
    expect(gate.openBySeverity['unclassified']).toBeUndefined();
  });
});
