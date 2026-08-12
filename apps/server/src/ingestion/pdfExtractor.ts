import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';

/**
 * Resolves an asset directory shipped inside the pdfjs-dist package
 * (standard font metrics / CMaps), independent of pnpm's nested
 * node_modules layout.
 */
function pdfjsAssetDir(subdir: string): string {
  const pkgJsonUrl = import.meta.resolve('pdfjs-dist/package.json');
  const pkgDir = path.dirname(fileURLToPath(pkgJsonUrl));
  return `${path.join(pkgDir, subdir)}${path.sep}`;
}

export interface PdfPageExtraction {
  /** Raw text for this page, exactly as emitted by the join algorithm below. */
  text: string;
  /** Length of `text` with surrounding whitespace trimmed — used only to
   *  decide parse confidence, never to alter what is stored. */
  significantCharCount: number;
}

export interface PdfExtractionResult {
  /** Full document text: every page's text joined with a single '\n'.
   *  This exact string is what gets persisted and is what character
   *  offsets for evidence highlighting are computed against downstream —
   *  nothing may normalize or re-trim it after this point. */
  text: string;
  pages: PdfPageExtraction[];
}

function hasStr(item: TextItem | { type: string }): item is TextItem {
  return 'str' in item;
}

/**
 * Extracts text from PDF bytes via pdfjs-dist.
 *
 * Join algorithm (documented because it fixes the exact offsets everything
 * downstream depends on): each text item's string is appended verbatim,
 * followed by a single space, except when pdfjs marks the item as ending a
 * line (`hasEOL`), in which case a newline is appended instead. This avoids
 * words from adjacent text runs silently concatenating into one token
 * (`"backend" + "systems"` -> `"backendsystems"`) while adding no
 * whitespace-collapsing normalization pass afterward.
 */
export async function extractPdfText(bytes: Buffer): Promise<PdfExtractionResult> {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl: pdfjsAssetDir('standard_fonts'),
    cMapUrl: pdfjsAssetDir('cmaps'),
    cMapPacked: true,
  });

  const pages: PdfPageExtraction[] = [];
  try {
    const doc = await loadingTask.promise;
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      try {
        const content = await page.getTextContent();
        let pageText = '';
        for (const item of content.items) {
          if (!hasStr(item)) {
            continue;
          }
          pageText += item.str;
          pageText += item.hasEOL ? '\n' : ' ';
        }
        pages.push({ text: pageText, significantCharCount: pageText.trim().length });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return { text: pages.map((p) => p.text).join('\n'), pages };
}
