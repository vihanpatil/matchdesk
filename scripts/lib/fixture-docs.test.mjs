import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  buildFixtureDocx,
  buildFixturePdf,
  FIXTURE_EPOCH,
  readZipEntries,
  writeZipDeterministic,
} from './fixture-docs.mjs';

/**
 * These tests exist because "the fixtures are generated, so they are
 * reproducible" is an assumption, and this project's history is assumptions
 * that held right up until someone measured them. Three separate sources of
 * nondeterminism were found while writing this module and only the first was
 * predicted; nothing here is theoretical.
 */

const SAMPLE = /** @type {const} */ ({
  lines: [
    'Alex Taylor',
    '',
    'Professional Experience',
    'Senior Engineer, Acme Corp, Jan 2020 - Present',
    '',
    'Skills',
    'TypeScript, Python, PostgreSQL',
  ],
});

/** @param {string} name @param {string} content @returns {{name: string, content: Buffer}} */
function entry(name, content) {
  return { name, content: Buffer.from(content, 'utf8') };
}

describe('deterministic generation', () => {
  it('produces byte-identical PDFs across separate builds', async () => {
    const a = await buildFixturePdf(SAMPLE);
    const b = await buildFixturePdf(SAMPLE);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('produces byte-identical DOCX files across separate builds', async () => {
    const a = await buildFixtureDocx(SAMPLE);
    const b = await buildFixtureDocx(SAMPLE);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  /**
   * The regression guard that matters. Byte-equality between two builds in the
   * same millisecond would pass even with a clock-derived timestamp in the
   * file, so equality alone does not prove the clock is out of the output.
   * These two assert the fixed instant is actually present and the current
   * year is actually absent.
   */
  it('stamps the PDF with the fixed epoch and not the current date', async () => {
    // Asserted through a real parse, not a byte scan. pdf-lib writes the info
    // dictionary inside an object stream (`/Type /ObjStm`), so the date never
    // appears as plain text in the file and a substring assertion silently
    // tests nothing — it passes for a document with no date at all.
    //
    // `updateMetadata: false` is load-bearing and was found the hard way. It
    // defaults to TRUE, so `load()` stamps the document it just read with the
    // CURRENT time before you can inspect it: this assertion first failed with
    // "expected 2026-08-13T21:17:16Z to equal 2020-01-01T00:00:00Z" against a
    // file whose bytes were provably identical across three processes. The
    // instrument was altering the thing it measured.
    const parsed = await PDFDocument.load(await buildFixturePdf(SAMPLE), {
      updateMetadata: false,
    });

    expect(parsed.getCreationDate()).toEqual(FIXTURE_EPOCH);
    expect(parsed.getModificationDate()).toEqual(FIXTURE_EPOCH);
    expect(parsed.getProducer()).toBe('matchdesk-fixtures');
    expect(parsed.getCreator()).toBe('matchdesk-fixtures');
  });

  it('stamps the DOCX core properties with the fixed epoch', async () => {
    const entries = readZipEntries(await buildFixtureDocx(SAMPLE));
    const core = entries.find((e) => e.name === 'docProps/core.xml');
    if (core === undefined) throw new Error('docProps/core.xml missing from generated DOCX');

    const xml = core.content.toString('utf8');
    expect(xml).toContain(FIXTURE_EPOCH.toISOString());
    expect(xml).not.toContain(String(new Date().getUTCFullYear()));
  });

  it('pins every ZIP entry timestamp to 1980-01-01, not the wall clock', async () => {
    const docx = await buildFixtureDocx(SAMPLE);
    // Local file header: mod time at +10, mod date at +12.
    expect(docx.readUInt16LE(10)).toBe(0x0000);
    expect(docx.readUInt16LE(12)).toBe(0x0021);
  });

  it('paginates rather than running text off the page', async () => {
    const short = await PDFDocument.load(await buildFixturePdf(SAMPLE));
    expect(short.getPageCount()).toBe(1);

    const many = { lines: Array.from({ length: 200 }, (_, i) => `Line ${String(i)}`) };
    const long = await PDFDocument.load(await buildFixturePdf(many));
    expect(long.getPageCount()).toBeGreaterThan(1);
  });
});

describe('writeZipDeterministic', () => {
  it('round-trips entries through readZipEntries', () => {
    const entries = [entry('b.xml', '<b/>'), entry('a/c.xml', '<c/>')];
    const read = readZipEntries(writeZipDeterministic(entries));

    expect(read.map((e) => e.name)).toEqual(['a/c.xml', 'b.xml']);
    expect(read.map((e) => e.content.toString('utf8'))).toEqual(['<c/>', '<b/>']);
  });

  it('is insensitive to the order entries are supplied in', () => {
    const forward = writeZipDeterministic([entry('a.xml', '1'), entry('b.xml', '2')]);
    const reverse = writeZipDeterministic([entry('b.xml', '2'), entry('a.xml', '1')]);
    expect(Buffer.compare(forward, reverse)).toBe(0);
  });

  it('writes an empty archive without an entry', () => {
    expect(readZipEntries(writeZipDeterministic([]))).toEqual([]);
  });

  it('refuses duplicate entry names', () => {
    expect(() => writeZipDeterministic([entry('a.xml', '1'), entry('a.xml', '2')])).toThrow(
      /duplicate entry name/,
    );
  });

  /**
   * Pins the bound on the backward EOCD scan. Below ~65 KB the scan starts at
   * offset 0 and the clamp never engages; a multi-page fixture crosses that
   * line, so this is a shape the corpus will actually produce rather than a
   * synthetic edge case.
   */
  it('reads an archive larger than the maximum ZIP comment', () => {
    const big = entry('big.xml', 'x'.repeat(70_000));
    const read = readZipEntries(writeZipDeterministic([big]));

    expect(read).toHaveLength(1);
    expect(read[0]?.content.length).toBe(70_000);
  });

  it('preserves content exactly, including non-ASCII', () => {
    const text = 'Rémi Dubois — Zoë Ashworth — 李 明';
    const [read] = readZipEntries(writeZipDeterministic([entry('n.txt', text)]));
    if (read === undefined) throw new Error('entry missing');
    expect(read.content.toString('utf8')).toBe(text);
  });
});

describe('readZipEntries fails closed', () => {
  it('throws when the buffer is too short to hold an EOCD record at all', () => {
    expect(() => readZipEntries(Buffer.from('not a zip file at all'))).toThrow(
      /no End of Central Directory record/,
    );
  });

  /**
   * The case above does NOT exercise the scan. At 21 bytes the buffer is
   * shorter than the 22-byte EOCD record, so the loop's start index is
   * negative and the body never runs — it passes without the search ever
   * happening. A probe that cannot fire is not evidence (H-052). This one is
   * long enough to actually scan, and pins that a bounded search over
   * non-matching bytes terminates and throws.
   */
  it('throws after actually scanning a long buffer with no EOCD signature', () => {
    expect(() => readZipEntries(Buffer.alloc(500))).toThrow(/no End of Central Directory record/);
  });

  it('throws when a central directory header signature is wrong', () => {
    const zip = writeZipDeterministic([entry('a.xml', '1')]);
    const eocd = zip.length - 22;
    const centralOffset = zip.readUInt32LE(eocd + 16);
    const corrupted = Buffer.from(zip);
    corrupted.writeUInt32LE(0xdeadbeef, centralOffset);

    expect(() => readZipEntries(corrupted)).toThrow(/expected a central directory header/);
  });

  it('throws when a central directory entry points at a non-local-header', () => {
    const zip = writeZipDeterministic([entry('a.xml', '1')]);
    const eocd = zip.length - 22;
    const centralOffset = zip.readUInt32LE(eocd + 16);
    const corrupted = Buffer.from(zip);
    // +42 is the relative offset of the local header.
    corrupted.writeUInt32LE(0, centralOffset + 42);
    corrupted.writeUInt32LE(0xdeadbeef, 0);

    expect(() => readZipEntries(corrupted)).toThrow(/not a local file header/);
  });

  it('throws on a compression method it cannot decode', () => {
    const zip = writeZipDeterministic([entry('a.xml', '1')]);
    const eocd = zip.length - 22;
    const centralOffset = zip.readUInt32LE(eocd + 16);
    const corrupted = Buffer.from(zip);
    // Method 12 (bzip2) is legal ZIP and absent from any .docx.
    corrupted.writeUInt16LE(12, centralOffset + 10);

    expect(() => readZipEntries(corrupted)).toThrow(/compression method 12/);
  });
});
