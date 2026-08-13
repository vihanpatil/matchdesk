/**
 * Deterministic PDF and DOCX generation for the Section 9.2 fixture corpus
 * (ADR-026, ADR-018/E3).
 *
 * **Why fixtures are generated rather than committed.** A committed binary
 * cannot be reviewed in a diff, so when an extraction result changes there is
 * no way to tell whether the FIXTURE moved or the CODE moved. That ambiguity
 * is the H-037 failure shape — a stale artifact treated as ground truth. The
 * definitions are readable source; the bytes are derived.
 *
 * **That only works if generation is deterministic, and neither library is out
 * of the box.** Measured 2026-08-13, generating the same document twice in
 * separate processes:
 *
 *     PDF, naive                     VARIES   (differs inside the compressed stream)
 *     PDF, all four dates pinned     STABLE
 *     DOCX, naive                    VARIES   (first difference at byte 10)
 *     DOCX, ZIP timestamps pinned    STILL VARIES, and the LENGTH changed too
 *
 * Three separate sources of nondeterminism had to be found, and only the first
 * was guessed correctly in advance:
 *
 * 1. **PDF info-dictionary dates.** `CreationDate`/`ModDate`, plus `Producer`
 *    and `Creator` which embed the pdf-lib version string. Because the file is
 *    compressed, a timestamp change perturbs bytes far from where the date
 *    lives, which makes this look more mysterious than it is.
 *
 * 2. **ZIP per-entry timestamps.** A .docx is a ZIP. Byte 10 of a ZIP is the
 *    local file header's DOS mod-time, stamped from the wall clock per entry
 *    by the archiver, independent of anything in the document model.
 *
 * 3. **`docProps/core.xml`.** This is the one that matters, because it is the
 *    one that looks handled when it is not. `docx@9.7.1`'s `IPropertiesOptions`
 *    has **no `created` or `modified` field at all** — the library always
 *    writes `new Date()`. Passing `created`/`modified` to the `Document`
 *    constructor is silently ignored at runtime. `pnpm typecheck` does catch it
 *    (`TS2353`), which is the gate doing its job, but only because
 *    `tsconfig.scripts.json` sets `checkJs` — in a plain untyped script it
 *    would have passed straight through and the fixtures would have looked
 *    deterministic right up until a test ran twice in the same second.
 *
 * Fixing (3) changes an entry's content length, so patching timestamps in
 * place is not enough and the archive has to be rebuilt. Since it is being
 * rebuilt anyway, {@link writeZipDeterministic} writes every entry
 * **STORED (uncompressed)**: it removes any dependence on a compressor
 * producing identical output across zlib versions, and makes the fixture
 * readable in a hex dump. The size cost is a few KB per fixture, which is
 * nothing against a handful of test files.
 */

import { crc32, inflateRawSync } from 'node:zlib';

import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * The single fixed instant every fixture is stamped with.
 *
 * Arbitrary, and deliberately in the past. It must never be derived from the
 * clock, or the byte-identical guarantee that justifies generating fixtures at
 * all would hold only within a single second.
 */
export const FIXTURE_EPOCH = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));

/** {@link FIXTURE_EPOCH} in the W3CDTF form `docProps/core.xml` uses. */
const FIXTURE_EPOCH_ISO = FIXTURE_EPOCH.toISOString();

const SIG_LOCAL_FILE = 0x04034b50;
const SIG_CENTRAL_FILE = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const LOCAL_HEADER_FIXED_SIZE = 30;
const CENTRAL_HEADER_FIXED_SIZE = 46;
const EOCD_SIZE = 22;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/**
 * DOS date for 1980-01-01, the earliest the format can represent:
 * `((year - 1980) << 9) | (month << 5) | day`.
 *
 * Zero would be simpler but encodes month 0 / day 0, which some archive tools
 * report as corrupt. This is the value reproducible-build tooling uses.
 */
const DOS_DATE_1980_01_01 = 0x0021;
const DOS_TIME_MIDNIGHT = 0x0000;

/** Maximum trailing ZIP comment, so the backward scan for the EOCD is bounded. */
const MAX_EOCD_COMMENT = 0xffff;

/**
 * @typedef {object} ZipEntry
 * @property {string} name
 * @property {Buffer} content Uncompressed bytes.
 */

/**
 * Locates the End of Central Directory record by scanning backwards.
 *
 * Fail-closed: a buffer whose EOCD cannot be found throws rather than being
 * returned unchanged. Returning it unchanged would let a nondeterministic
 * archive through silently, which is the exact failure this module exists to
 * prevent.
 *
 * @param {Buffer} buffer
 * @returns {number}
 */
function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - MAX_EOCD_COMMENT - EOCD_SIZE);
  for (let offset = buffer.length - EOCD_SIZE; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === SIG_EOCD) return offset;
  }
  throw new Error(
    'readZipEntries: no End of Central Directory record found. This is not a ZIP ' +
      'archive, so it cannot be rebuilt deterministically.',
  );
}

/**
 * Reads every entry out of a ZIP, decompressing as needed.
 *
 * Walks the central directory rather than scanning for signatures. A naive
 * scan would also match those four bytes wherever they occur inside compressed
 * data; the central directory is the only authoritative list of header
 * locations. Sizes are taken from the central directory because the local
 * header carries zeroes whenever the archiver used a data descriptor.
 *
 * @param {Buffer} buffer
 * @returns {ZipEntry[]}
 */
export function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);

  /** @type {ZipEntry[]} */
  const entries = [];

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(cursor) !== SIG_CENTRAL_FILE) {
      throw new Error(
        `readZipEntries: expected a central directory header for entry ${String(i)} at ` +
          `offset ${String(cursor)}. The archive is malformed; refusing to read it.`,
      );
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString(
      'utf8',
      cursor + CENTRAL_HEADER_FIXED_SIZE,
      cursor + CENTRAL_HEADER_FIXED_SIZE + nameLen,
    );

    if (buffer.readUInt32LE(localOffset) !== SIG_LOCAL_FILE) {
      throw new Error(
        `readZipEntries: entry "${name}" points at offset ${String(localOffset)}, which is ` +
          'not a local file header. Refusing to read it.',
      );
    }

    // The local header has its OWN name/extra lengths, which legitimately
    // differ from the central directory's. Using the central values here would
    // land the data offset in the wrong place.
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + LOCAL_HEADER_FIXED_SIZE + localNameLen + localExtraLen;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    let content;
    if (method === METHOD_STORED) {
      content = Buffer.from(raw);
    } else if (method === METHOD_DEFLATE) {
      content = inflateRawSync(raw);
    } else {
      throw new Error(
        `readZipEntries: entry "${name}" uses compression method ${String(method)}, which is ` +
          'not supported. Only stored and deflate appear in a .docx.',
      );
    }

    entries.push({ name, content });
    cursor += CENTRAL_HEADER_FIXED_SIZE + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Writes entries into a ZIP with every varying field fixed.
 *
 * Entries are STORED rather than deflated (see the module comment), emitted in
 * sorted name order, and stamped with a constant DOS timestamp. Nothing here
 * reads the clock, the filesystem, or any library version string, so the
 * output is a pure function of the entries.
 *
 * @param {readonly ZipEntry[]} entries
 * @returns {Buffer}
 */
export function writeZipDeterministic(entries) {
  // Duplicate names are rejected rather than written. A ZIP with two entries
  // of the same name is readable — readers disagree about which one wins — so
  // writing it would produce a fixture whose content depends on the reader.
  // That is precisely the class of ambiguity fixtures exist to remove.
  const names = new Set();
  for (const { name } of entries) {
    if (names.has(name)) {
      throw new Error(
        `writeZipDeterministic: duplicate entry name "${name}". Readers disagree about which ` +
          'copy wins, so the archive would not have one well-defined content.',
      );
    }
    names.add(name);
  }

  // Total given the check above, so both branches are reachable and neither is
  // dead. A three-way comparator would carry an equal-case branch that can
  // never fire, which mutation testing correctly reports as unpinned.
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));

  /** @type {Buffer[]} */
  const localParts = [];
  /** @type {Buffer[]} */
  const centralParts = [];
  let offset = 0;

  for (const entry of sorted) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.content);
    const size = entry.content.length;

    const local = Buffer.alloc(LOCAL_HEADER_FIXED_SIZE);
    local.writeUInt32LE(SIG_LOCAL_FILE, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(METHOD_STORED, 8);
    local.writeUInt16LE(DOS_TIME_MIDNIGHT, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localParts.push(local, nameBytes, entry.content);

    const central = Buffer.alloc(CENTRAL_HEADER_FIXED_SIZE);
    central.writeUInt32LE(SIG_CENTRAL_FILE, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(METHOD_STORED, 10);
    central.writeUInt16LE(DOS_TIME_MIDNIGHT, 12);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += LOCAL_HEADER_FIXED_SIZE + nameBytes.length + size;
  }

  const localBlock = Buffer.concat(localParts);
  const centralBlock = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(EOCD_SIZE);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

/**
 * Replaces the wall-clock timestamps `docx` writes into `docProps/core.xml`.
 *
 * Length-preserving in practice — both values are 24-character W3CDTF strings
 * — but nothing depends on that, because the archive is rebuilt from the
 * modified content rather than patched in place.
 *
 * @param {Buffer} content
 * @returns {Buffer}
 */
function pinCorePropertyDates(content) {
  const xml = content.toString('utf8');
  const pinned = xml.replace(
    /(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g,
    `$1${FIXTURE_EPOCH_ISO}$2`,
  );
  return Buffer.from(pinned, 'utf8');
}

/**
 * @typedef {object} FixtureDocument
 * @property {readonly string[]} lines Text content, one entry per line. Blank
 *   strings are preserved — CV structure is partly conveyed by blank lines, and
 *   dropping them would change what the section detector sees.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const FONT_SIZE = 11;
const LEADING = 15;

/**
 * Renders a fixture definition to a deterministic PDF.
 *
 * Text is laid out top-down with a fixed leading and paginated on overflow.
 * Pagination matters even though off-page text would still appear in the
 * content stream: a fixture that does not paginate the way a real document
 * does is not testing the reader on a shape it will actually meet.
 *
 * @param {FixtureDocument} definition
 * @returns {Promise<Buffer>}
 */
export async function buildFixturePdf(definition) {
  const doc = await PDFDocument.create();

  // All four must be pinned. Producer and Creator embed the pdf-lib version
  // string by default, which would make a dependency bump look like a fixture
  // change rather than what it is.
  doc.setCreationDate(FIXTURE_EPOCH);
  doc.setModificationDate(FIXTURE_EPOCH);
  doc.setProducer('matchdesk-fixtures');
  doc.setCreator('matchdesk-fixtures');

  const font = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of definition.lines) {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    if (line !== '') {
      page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font });
    }
    y -= LEADING;
  }

  return Buffer.from(await doc.save());
}

/**
 * Renders a fixture definition to a deterministic DOCX.
 *
 * `docx` produces the document correctly and the container
 * nondeterministically, so the archive is unpacked, its clock-derived metadata
 * pinned, and repacked by {@link writeZipDeterministic}. See the module comment
 * for why the obvious fix — passing `created`/`modified` to `Document` — does
 * not work.
 *
 * @param {FixtureDocument} definition
 * @returns {Promise<Buffer>}
 */
export async function buildFixtureDocx(definition) {
  const doc = new Document({
    creator: 'matchdesk-fixtures',
    description: 'Synthetic MatchDesk test fixture (ADR-014: never a real CV)',
    title: 'MatchDesk fixture',
    sections: [
      {
        children: definition.lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
      },
    ],
  });

  const entries = readZipEntries(await Packer.toBuffer(doc)).map((entry) =>
    entry.name === 'docProps/core.xml'
      ? { name: entry.name, content: pinCorePropertyDates(entry.content) }
      : entry,
  );

  return writeZipDeterministic(entries);
}
