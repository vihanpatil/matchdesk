import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getDataDir, getDbPath, getFilesDir } from './paths.js';

describe('getDataDir', () => {
  it('defaults to ~/.matchdesk when MATCHDESK_DATA_DIR is unset', () => {
    const original = process.env['MATCHDESK_DATA_DIR'];
    delete process.env['MATCHDESK_DATA_DIR'];
    try {
      expect(getDataDir()).toBe(path.join(homedir(), '.matchdesk'));
    } finally {
      if (original !== undefined) {
        process.env['MATCHDESK_DATA_DIR'] = original;
      }
    }
  });

  it('honours MATCHDESK_DATA_DIR when set, resolved to an absolute path', () => {
    const original = process.env['MATCHDESK_DATA_DIR'];
    process.env['MATCHDESK_DATA_DIR'] = '/tmp/matchdesk-test-dir';
    try {
      expect(getDataDir()).toBe(path.resolve('/tmp/matchdesk-test-dir'));
    } finally {
      if (original === undefined) {
        delete process.env['MATCHDESK_DATA_DIR'];
      } else {
        process.env['MATCHDESK_DATA_DIR'] = original;
      }
    }
  });

  it('ignores an empty-string override and falls back to the home dir', () => {
    const original = process.env['MATCHDESK_DATA_DIR'];
    process.env['MATCHDESK_DATA_DIR'] = '';
    try {
      expect(getDataDir()).toBe(path.join(homedir(), '.matchdesk'));
    } finally {
      if (original === undefined) {
        delete process.env['MATCHDESK_DATA_DIR'];
      } else {
        process.env['MATCHDESK_DATA_DIR'] = original;
      }
    }
  });
});

describe('getDbPath / getFilesDir', () => {
  it('places the db file and files dir under the given data dir', () => {
    expect(getDbPath('/tmp/xyz')).toBe(path.join('/tmp/xyz', 'matchdesk.db'));
    expect(getFilesDir('/tmp/xyz')).toBe(path.join('/tmp/xyz', 'files'));
  });
});
