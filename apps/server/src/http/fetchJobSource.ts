import { extractJobPageText, MIN_HTML_TEXT_CHARS } from '../ingestion/htmlExtractor.js';

/**
 * Fetches a recruiter-pasted job-posting link and turns it into the same
 * shape an upload arrives in: bytes plus a filename whose extension routes
 * `extractText` (ADR-037).
 *
 * **This is the product's only outbound network action**, and its bounds are
 * the ADR's whole point: it runs only on an explicit recruiter action, it
 * contacts only the URL they pasted, and nothing from the local store — no
 * candidate content, no job content, no identifiers — is sent with the
 * request. The fetched bytes are stored content-addressed exactly like an
 * uploaded file, then face the same refusal gates.
 *
 * Failure surface is deliberately typed, not stringly sniffed by the route:
 * every anticipated failure throws {@link JobFetchError} with the HTTP
 * status the API should answer, so the route's catch clause cannot drift
 * out of sync with the causes.
 */

export class JobFetchError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'JobFetchError';
  }
}

export interface FetchedJobSource {
  readonly bytes: Buffer;
  /** Synthesized filename whose extension routes `extractText`. */
  readonly filename: string;
  /** The page's own <title> (HTML only; empty otherwise) — the default job
   *  title when the recruiter leaves theirs blank. */
  readonly pageTitle: string;
}

/** Same bound as uploads: generous for any posting, bounds memory. */
const MAX_FETCH_BYTES = 20 * 1024 * 1024;

/** A pasted careers link can sit behind sluggish redirect chains; beyond
 *  this the recruiter is better served by an error than a spinner. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Host and last meaningful path segment, as a filesystem-safe slug —
 *  `boards.example.com/jobs/4187-senior-backend` →
 *  `boards-example-com-4187-senior-backend`. Provenance display uses the
 *  full `sourceUrl`; this only has to be recognisable in a filename. */
function slugFor(url: URL): string {
  const segments = url.pathname.split('/').filter((s) => s !== '');
  const last = segments[segments.length - 1] ?? '';
  return (
    `${url.hostname}-${last}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'job'
  );
}

async function readCapped(response: Response): Promise<Buffer> {
  if (response.body === null) return Buffer.alloc(0);
  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_FETCH_BYTES) {
      await reader.cancel();
      throw new JobFetchError(
        413,
        `the page is larger than ${String(MAX_FETCH_BYTES)} bytes — not a job posting`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function fetchJobSource(
  rawUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<FetchedJobSource> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new JobFetchError(400, 'that is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new JobFetchError(400, `only http(s) links are supported (got "${url.protocol}")`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // An honest, disclosed identity. Some boards refuse UA-less clients.
        'user-agent': 'MatchDesk/1.0 (local recruiting tool; fetches only pasted links)',
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5',
      },
    });
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new JobFetchError(
      502,
      timedOut
        ? `the link did not respond within ${String(Math.round(timeoutMs / 1000))}s`
        : `could not fetch the link: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }

  if (!response.ok) {
    throw new JobFetchError(502, `the link answered HTTP ${String(response.status)}`);
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const bytes = await readCapped(response);

  if (contentType.includes('application/pdf') || url.pathname.toLowerCase().endsWith('.pdf')) {
    return { bytes, filename: `${slugFor(url)}.pdf`, pageTitle: '' };
  }
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml') ||
    contentType.startsWith('text/plain') ||
    contentType === ''
  ) {
    // text/plain and missing content-type go through the HTML path too: the
    // tag-stripper is a no-op on tagless text, so a plain-text posting
    // simply passes through it.
    const page = extractJobPageText(bytes.toString('utf8'));
    if (page.source === 'markup' && page.significantCharCount < MIN_HTML_TEXT_CHARS) {
      // The page is a JavaScript shell with no JSON-LD (H-120's BambooHR
      // case). A recognised board's own posting endpoint — SAME host, the
      // request its own JavaScript would make — is the last honest source
      // before refusing with guidance.
      const fromBoard = await tryKnownBoardEndpoint(url, timeoutMs);
      if (fromBoard !== null) return fromBoard;
    }
    return { bytes, filename: `${slugFor(url)}.html`, pageTitle: page.title };
  }
  throw new JobFetchError(
    415,
    `the link serves "${contentType}", which is not a page or a PDF — ` +
      'save the posting as PDF and upload it instead',
  );
}

/* ── recognised hosted boards (H-120) ─────────────────────────────────────
 *
 * Some boards ship a shell with NO markup text and NO JSON-LD; their pages
 * load the posting from a public JSON endpoint on the same host. Fetching
 * that endpoint is what the recruiter's own browser does on the same click
 * — same host, same posting, one extra request — and stays inside ADR-037's
 * amended bound (recorded in the ADR and PRODUCT_DECISIONS). Every entry
 * here exists because a real link was measured to need it; the registry is
 * additive and deliberately tiny.
 */

/** The BambooHR careers convention: a `/careers/<id>` page whose posting
 *  lives at `/careers/<id>/detail` as `result.jobOpening` JSON. Detected by
 *  PATH, not hostname, deliberately: BambooHR white-labels custom domains,
 *  so hostname matching would miss real boards. The probe only fires when
 *  the page itself carried no text, goes to the SAME host, and any response
 *  without the convention's shape falls through to the guidance path. */
async function tryBambooHr(url: URL, timeoutMs: number): Promise<FetchedJobSource | null> {
  const idMatch = /^\/careers\/(\d+)\/?$/.exec(url.pathname);
  if (idMatch === null) return null;

  let payload: unknown;
  try {
    const response = await fetch(`${url.origin}/careers/${idMatch[1] ?? ''}/detail`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'MatchDesk/1.0 (local recruiting tool; fetches only pasted links)',
        accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    // The board endpoint is a fallback: on any failure the caller proceeds
    // with the shell bytes, which refuse with actionable guidance.
    return null;
  }

  const opening =
    typeof payload === 'object' && payload !== null
      ? ((payload as { result?: { jobOpening?: unknown } }).result?.jobOpening ?? null)
      : null;
  if (typeof opening !== 'object' || opening === null) return null;
  const record = opening as Record<string, unknown>;
  const name = typeof record['jobOpeningName'] === 'string' ? record['jobOpeningName'] : '';
  const description = typeof record['description'] === 'string' ? record['description'] : '';
  if (name === '' || description === '') return null;

  const locationRecord =
    typeof record['location'] === 'object' && record['location'] !== null
      ? (record['location'] as Record<string, unknown>)
      : {};
  const employment =
    typeof record['employmentStatusLabel'] === 'string' ? record['employmentStatusLabel'] : '';

  // The stored document IS a schema.org JobPosting page: the board's data
  // re-expressed in the standard vocabulary, so extraction takes the same
  // JSON-LD path an Ashby page does (posting-grade confidence, no ad-hoc
  // escaping — JSON.stringify is the encoder). What the recruiter stores is
  // exactly what the board's endpoint said, in the format the web already
  // uses for job postings.
  const posting = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: name,
    description,
    employmentType: employment,
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: typeof locationRecord['city'] === 'string' ? locationRecord['city'] : '',
        addressRegion: typeof locationRecord['state'] === 'string' ? locationRecord['state'] : '',
      },
    },
  };
  const html = `<title>${name.replace(/[<&]/g, ' ')}</title>\n<script type="application/ld+json">\n${JSON.stringify(posting, null, 1).replace(/<\/script/gi, '<\\/script')}\n</script>\n`;

  return {
    bytes: Buffer.from(html, 'utf8'),
    filename: `${slugFor(url)}.html`,
    pageTitle: name,
  };
}

const KNOWN_BOARDS = [tryBambooHr];

async function tryKnownBoardEndpoint(
  url: URL,
  timeoutMs: number,
): Promise<FetchedJobSource | null> {
  for (const board of KNOWN_BOARDS) {
    const result = await board(url, timeoutMs);
    if (result !== null) return result;
  }
  return null;
}
