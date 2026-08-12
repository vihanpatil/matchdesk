import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Sidecar content-addressed file store (ADR-008): original uploaded bytes
 * never enter the database (Section 11's 500MB budget would be blown by
 * scanned PDFs at 5-20MB each). They live at `<filesDir>/<sha256>`; the
 * database holds only the hash and the original filename.
 *
 * Content addressing gives deduplication for free: the same bytes always
 * hash to the same name, so re-storing identical content is a no-op.
 */

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function getStoredFilePath(filesDir: string, sha256: string): string {
  return path.join(filesDir, sha256);
}

export interface StoreFileResult {
  sha256: string;
  /** Path relative to `filesDir` — this, plus filesDir, is what the DB stores. */
  relativePath: string;
  /** True if this exact content was already on disk before this call. */
  alreadyExisted: boolean;
}

/**
 * Writes `bytes` to `<filesDir>/<sha256(bytes)>`. Idempotent: if the file
 * already exists, its content is trusted (content-addressed storage cannot
 * legitimately disagree with its own name) and nothing is re-written.
 *
 * Writes via a temp file + rename so a crash mid-write can never leave a
 * corrupt file sitting at the final content-addressed path — a reader could
 * otherwise trust a truncated file simply because the name matched.
 */
export function storeFile(filesDir: string, bytes: Buffer): StoreFileResult {
  if (bytes.length === 0) {
    throw new Error('storeFile: refusing to store an empty (zero-length) buffer');
  }

  const sha256 = sha256Hex(bytes);
  const finalPath = getStoredFilePath(filesDir, sha256);

  if (existsSync(finalPath)) {
    return { sha256, relativePath: sha256, alreadyExisted: true };
  }

  const tmpPath = `${finalPath}.tmp-${String(process.pid)}-${sha256Hex(Buffer.from(String(bytes.length)))}`;
  writeFileSync(tmpPath, bytes);
  try {
    renameSync(tmpPath, finalPath);
  } catch (error: unknown) {
    unlinkSync(tmpPath);
    throw error;
  }

  return { sha256, relativePath: sha256, alreadyExisted: false };
}

export function readStoredFile(filesDir: string, sha256: string): Buffer {
  const filePath = getStoredFilePath(filesDir, sha256);
  if (!existsSync(filePath)) {
    throw new Error(`readStoredFile: no stored file for hash ${sha256} in ${filesDir}`);
  }
  return readFileSync(filePath);
}
