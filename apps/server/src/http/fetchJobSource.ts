import { extractHtmlText } from '../ingestion/htmlExtractor.js';

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
    return {
      bytes,
      filename: `${slugFor(url)}.html`,
      pageTitle: extractHtmlText(bytes.toString('utf8')).title,
    };
  }
  throw new JobFetchError(
    415,
    `the link serves "${contentType}", which is not a page or a PDF — ` +
      'save the posting as PDF and upload it instead',
  );
}
