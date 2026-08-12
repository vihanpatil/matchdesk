import path from 'node:path';

import { extractDocxText } from './docxExtractor.js';
import { detectLanguageHeuristic, type LanguageDetectionResult } from './languageDetection.js';
import { extractPdfText } from './pdfExtractor.js';

export type ParseStatus = 'ok' | 'needs_attention' | 'failed';

export type ExtractionReason =
  | 'low_text_density_possible_scan'
  | 'low_text_density'
  | 'no_extractable_text'
  | 'language_undetermined'
  | 'non_english_language_not_supported'
  | null;

export interface ExtractionResult {
  /**
   * Text passed through verbatim from the format-specific extractor with no
   * further normalization — character offsets computed against this by
   * packages/core (evidence highlighting) stay valid because nothing here
   * shifts them after extraction.
   */
  text: string;
  parseStatus: ParseStatus;
  /** 0 (no confidence) .. 1 (high confidence). */
  parseConfidence: number;
  warnings: string[];
  /** 'en' when confidently English; null whenever the document is not
   *  scored — either because English could not be confirmed or because it
   *  was confirmed to be a different language (ADR-006: never silently
   *  score a document we could not read, C7). */
  language: 'en' | null;
  reason: ExtractionReason;
}

export class UnsupportedFormatError extends Error {
  constructor(filename: string, detail: string) {
    super(`Unsupported file format for "${filename}": ${detail}`);
    this.name = 'UnsupportedFormatError';
  }
}

/** Below this, a PDF page is treated as likely-scanned. No OCR is attempted
 *  in this slice (deferred) — the document is flagged for human attention
 *  instead of silently scored (C7). */
const MIN_CHARS_PER_PAGE = 100;

/** Below this total, a DOCX (which has no fixed "page" concept via mammoth)
 *  is treated the same way. */
const MIN_TOTAL_CHARS_DOCX = 100;

function judgeLanguage(
  text: string,
  warnings: string[],
  baseConfidence: number,
): Pick<ExtractionResult, 'parseStatus' | 'parseConfidence' | 'warnings' | 'language' | 'reason'> {
  const lang: LanguageDetectionResult = detectLanguageHeuristic(text);

  if (lang.isEnglish === null) {
    return {
      parseStatus: 'needs_attention',
      parseConfidence: baseConfidence * 0.5,
      warnings: [...warnings, 'Not enough text to determine language confidently.'],
      language: null,
      reason: 'language_undetermined',
    };
  }

  if (!lang.isEnglish) {
    return {
      parseStatus: 'needs_attention',
      parseConfidence: baseConfidence,
      warnings: [...warnings, 'Language not supported — English only (ADR-006).'],
      language: null,
      reason: 'non_english_language_not_supported',
    };
  }

  return {
    parseStatus: 'ok',
    parseConfidence: baseConfidence,
    warnings,
    language: 'en',
    reason: null,
  };
}

async function extractFromPdf(bytes: Buffer): Promise<ExtractionResult> {
  const { text, pages } = await extractPdfText(bytes);

  if (pages.length === 0 || text.trim().length === 0) {
    return {
      text,
      parseStatus: 'failed',
      parseConfidence: 0,
      warnings: ['No extractable text found in this PDF.'],
      language: null,
      reason: 'no_extractable_text',
    };
  }

  const lowDensityPages = pages.filter((p) => p.significantCharCount < MIN_CHARS_PER_PAGE);
  if (lowDensityPages.length > 0) {
    return {
      text,
      parseStatus: 'needs_attention',
      parseConfidence: 0.2,
      warnings: [
        `Low text density on ${String(lowDensityPages.length)} of ${String(pages.length)} page(s) ` +
          `(under ${String(MIN_CHARS_PER_PAGE)} characters) — this looks like a scanned or image-based PDF. ` +
          'OCR is not performed in this slice; the document needs manual attention.',
      ],
      language: null,
      reason: 'low_text_density_possible_scan',
    };
  }

  const judged = judgeLanguage(text, [], 0.9);
  return { text, ...judged };
}

async function extractFromDocx(bytes: Buffer): Promise<ExtractionResult> {
  const { text, significantCharCount, warnings: mammothWarnings } = await extractDocxText(bytes);

  if (significantCharCount === 0) {
    return {
      text,
      parseStatus: 'failed',
      parseConfidence: 0,
      warnings: [...mammothWarnings, 'No extractable text found in this document.'],
      language: null,
      reason: 'no_extractable_text',
    };
  }

  if (significantCharCount < MIN_TOTAL_CHARS_DOCX) {
    return {
      text,
      parseStatus: 'needs_attention',
      parseConfidence: 0.2,
      warnings: [
        ...mammothWarnings,
        `Only ${String(significantCharCount)} characters of extractable text found ` +
          `(under ${String(MIN_TOTAL_CHARS_DOCX)}) — this document needs manual attention. ` +
          'OCR is not performed in this slice.',
      ],
      language: null,
      reason: 'low_text_density',
    };
  }

  const judged = judgeLanguage(text, mammothWarnings, 0.9);
  return { text, ...judged };
}

/**
 * Extracts plain text from uploaded bytes, dispatching on file extension.
 *
 * NO OCR in this slice (deferred) — a low-text-density PDF page is flagged
 * `needs_attention` rather than silently attempted (C7). Non-English text
 * is flagged `needs_attention` and never marked as passing English so it
 * cannot be scored downstream (ADR-006).
 */
export async function extractText(
  bytes: Buffer,
  originalFilename: string,
): Promise<ExtractionResult> {
  const ext = path.extname(originalFilename).toLowerCase();

  if (ext === '.pdf') {
    return extractFromPdf(bytes);
  }
  if (ext === '.docx') {
    return extractFromDocx(bytes);
  }

  throw new UnsupportedFormatError(
    originalFilename,
    `only .pdf and .docx are supported (got "${ext === '' ? 'no extension' : ext}")`,
  );
}
