import mammoth from 'mammoth';

export interface DocxExtractionResult {
  /** Raw text exactly as returned by mammoth — passed through verbatim,
   *  no whitespace normalization, so downstream offset computation is
   *  never shifted by this layer. */
  text: string;
  significantCharCount: number;
  warnings: string[];
}

/**
 * Extracts text from DOCX bytes via mammoth's raw-text mode (no HTML
 * conversion — we want plain text with stable offsets, not markup).
 */
export async function extractDocxText(bytes: Buffer): Promise<DocxExtractionResult> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return {
    text: result.value,
    significantCharCount: result.value.trim().length,
    warnings: result.messages.map((m) => m.message),
  };
}
