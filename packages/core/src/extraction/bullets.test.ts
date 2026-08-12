import { describe, expect, it } from 'vitest';

import { segmentLines } from './bullets.js';

describe('segmentLines', () => {
  it('splits text into trimmed, non-empty line segments with correct spans', () => {
    const text = 'PostgreSQL\n- Python\n\n* Docker';
    const lines = segmentLines(text);

    expect(lines.map((l) => l.text)).toEqual(['PostgreSQL', 'Python', 'Docker']);
    for (const line of lines) {
      expect(text.slice(line.start, line.end)).toBe(line.text);
    }
  });

  it('strips common bullet markers (-, *, •, digit.) from the front of a line', () => {
    const text = ['- PostgreSQL', '* Python', '• Docker', '1. Kubernetes', '2) Terraform'].join(
      '\n',
    );
    const lines = segmentLines(text);
    expect(lines.map((l) => l.text)).toEqual([
      'PostgreSQL',
      'Python',
      'Docker',
      'Kubernetes',
      'Terraform',
    ]);
  });

  it('reports isBullet true only for lines that had a marker stripped', () => {
    const text = ['Skills', '- PostgreSQL'].join('\n');
    const lines = segmentLines(text);
    expect(lines.map((l) => l.isBullet)).toEqual([false, true]);
  });

  it('skips blank and whitespace-only lines', () => {
    const text = 'A\n\n   \nB';
    const lines = segmentLines(text);
    expect(lines.map((l) => l.text)).toEqual(['A', 'B']);
  });

  it('returns an empty array for empty text', () => {
    expect(segmentLines('')).toEqual([]);
  });

  it('every line span exactly covers its trimmed text', () => {
    const text = '  - PostgreSQL and Python  \nDocker';
    const lines = segmentLines(text);
    for (const line of lines) {
      expect(text.slice(line.start, line.end)).toBe(line.text);
    }
  });
});
