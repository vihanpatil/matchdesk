import { describe, expect, it } from 'vitest';

import { highlightSegments } from '../public/lib/highlight.mjs';
import { rankResults } from '../public/lib/rank.mjs';

const r = (candidateId, score, eligible) => ({
  candidateId,
  result: { score, eligibility: { eligible } },
});

describe('rankResults', () => {
  it('partitions structurally: no ineligible above any eligible, whatever the score', () => {
    const { eligible, ineligible } = rankResults([r('a', 100, false), r('b', 1, true)]);
    expect(eligible.map((x) => x.candidateId)).toEqual(['b']);
    expect(ineligible.map((x) => x.candidateId)).toEqual(['a']);
  });

  it('sorts by score desc with a deterministic id tie-break (C4)', () => {
    const { eligible } = rankResults([r('z', 80, true), r('a', 80, true), r('m', 90, true)]);
    expect(eligible.map((x) => x.candidateId)).toEqual(['m', 'a', 'z']);
  });
});

describe('highlightSegments', () => {
  it('splits around a span', () => {
    expect(highlightSegments('abcdef', [{ start: 2, end: 4 }])).toEqual([
      { text: 'ab', marked: false },
      { text: 'cd', marked: true },
      { text: 'ef', marked: false },
    ]);
  });

  it('merges overlapping and touching spans so text is marked once', () => {
    const segs = highlightSegments('abcdefgh', [
      { start: 4, end: 6 },
      { start: 1, end: 3 },
      { start: 2, end: 5 },
    ]);
    expect(segs).toEqual([
      { text: 'a', marked: false },
      { text: 'bcdef', marked: true },
      { text: 'gh', marked: false },
    ]);
  });

  it('clips out-of-range spans instead of throwing — a span is a claim about the text, and a bad one must not take the view down', () => {
    expect(highlightSegments('abc', [{ start: -5, end: 99 }])).toEqual([
      { text: 'abc', marked: true },
    ]);
    expect(highlightSegments('abc', [{ start: 9, end: 12 }])).toEqual([
      { text: 'abc', marked: false },
    ]);
  });

  it('round-trips: concatenated segments always equal the original text', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const segs = highlightSegments(text, [
      { start: 4, end: 9 },
      { start: 16, end: 19 },
      { start: 8, end: 15 },
    ]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });
});
