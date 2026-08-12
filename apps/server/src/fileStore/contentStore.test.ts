import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getStoredFilePath, readStoredFile, sha256Hex, storeFile } from './contentStore.js';

describe('sha256Hex', () => {
  it('matches a known SHA-256 vector', () => {
    // echo -n "hello world" | sha256sum
    expect(sha256Hex(Buffer.from('hello world'))).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });
});

describe('storeFile / readStoredFile', () => {
  let filesDir: string;

  beforeEach(() => {
    filesDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-files-'));
  });

  afterEach(() => {
    rmSync(filesDir, { recursive: true, force: true });
  });

  it('writes bytes to <filesDir>/<sha256> and reports the hash', () => {
    const bytes = Buffer.from('some pdf bytes, pretend');
    const result = storeFile(filesDir, bytes);

    expect(result.sha256).toBe(sha256Hex(bytes));
    expect(existsSync(path.join(filesDir, result.sha256))).toBe(true);
    expect(readFileSync(path.join(filesDir, result.sha256))).toEqual(bytes);
  });

  it('is idempotent: storing the same bytes twice does not error and yields the same hash', () => {
    const bytes = Buffer.from('identical content');
    const first = storeFile(filesDir, bytes);
    const second = storeFile(filesDir, bytes);

    expect(second.sha256).toBe(first.sha256);
    expect(readFileSync(path.join(filesDir, first.sha256))).toEqual(bytes);
  });

  it('does not corrupt an existing file when re-storing identical bytes', () => {
    const bytes = Buffer.from('a'.repeat(1000));
    storeFile(filesDir, bytes);
    // Tamper the mtime path is irrelevant; just confirm second store leaves content correct.
    storeFile(filesDir, bytes);
    const onDisk = readFileSync(path.join(filesDir, sha256Hex(bytes)));
    expect(onDisk.length).toBe(1000);
  });

  it('readStoredFile returns exactly the bytes that were stored', () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254, 253]);
    const { sha256 } = storeFile(filesDir, bytes);
    expect(readStoredFile(filesDir, sha256)).toEqual(bytes);
  });

  it('readStoredFile throws a clear error for a hash that was never stored', () => {
    expect(() => readStoredFile(filesDir, 'deadbeef'.repeat(8))).toThrow(/no stored file/i);
  });

  it('getStoredFilePath returns the expected path without touching the filesystem', () => {
    const p = getStoredFilePath(filesDir, 'abc123');
    expect(p).toBe(path.join(filesDir, 'abc123'));
  });

  it('rejects a zero-length buffer rather than silently storing an empty file', () => {
    expect(() => storeFile(filesDir, Buffer.alloc(0))).toThrow(/empty/i);
  });

  it('writes files that pre-existing unrelated files in the dir do not affect', () => {
    writeFileSync(path.join(filesDir, 'unrelated.txt'), 'noise');
    const bytes = Buffer.from('real content');
    const result = storeFile(filesDir, bytes);
    expect(readFileSync(path.join(filesDir, result.sha256))).toEqual(bytes);
  });
});
