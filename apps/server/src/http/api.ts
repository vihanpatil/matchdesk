import type { IncomingMessage, ServerResponse } from 'node:http';

import type Database from 'better-sqlite3';
import { z } from 'zod';

import {
  ingestCandidateDocument,
  ingestJobDocument,
  scoreJobAgainstCandidates,
  type ReferenceDate,
} from '../pipeline/pipeline.js';
import { getCandidateById, listCandidates } from '../repositories/candidates.js';
import { deleteCandidate, deleteJob } from '../repositories/deletion.js';
import { getJobById, listJobs } from '../repositories/jobs.js';
import {
  getJobScoringConfig,
  JobScoringConfigSchema,
  scoringJobFor,
  upsertJobScoringConfig,
} from '../repositories/jobScoringConfigs.js';
import { listMatchesForJob } from '../repositories/matches.js';
import { proposeRequirements } from '../scoring/proposeRequirements.js';

import { fetchJobSource, JobFetchError } from './fetchJobSource.js';

/**
 * The HTTP API the UI talks to (ADR-035). Loopback-only by construction — the
 * caller binds `127.0.0.1` — plus a Host-header check here, because a
 * loopback bind alone does not stop DNS rebinding: a malicious page can point
 * its own hostname at 127.0.0.1 and the browser will happily connect. C3 says
 * candidate data never leaves the machine; that includes not serving it to a
 * hostname we never agreed to answer.
 *
 * Built on `node:http` with zero new dependencies, deliberately:
 * - uploads are RAW BYTES (`POST` body) with metadata in query params, so no
 *   multipart parser enters the supply chain (ADR-003/ADR-033 make every new
 *   package expensive on purpose);
 * - everything else is JSON.
 *
 * No CORS headers, also deliberately: in production the UI is served from
 * this same origin, and in development the UI dev server proxies `/api` here.
 * Adding CORS would widen the boundary C3 exists to keep narrow.
 */

/** 20 MB — generous for any CV/JD, small enough to bound memory. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface ApiOptions {
  readonly db: Database.Database;
  readonly filesDir: string;
  /** Injectable for tests; production passes wall-clock values (ADR-024
   *  requires the reference date to be recorded with every score, which the
   *  pipeline already does). */
  readonly now: () => { referenceDate: ReferenceDate; computedAt: string };
  /** ADR-037 link-fetch timeout; injectable so tests can use a stalled local
   *  server without waiting 20s. */
  readonly fetchTimeoutMs?: number;
}

/** ADR-037: body of POST /api/jobs/from-url. `title` overrides the page's
 *  own <title>; blank/absent means "use what the page calls itself". */
const JobFromUrlSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
});

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        reject(new Error(`body exceeds ${String(MAX_UPLOAD_BYTES)} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

const HOST_ALLOWED = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function createApi(options: ApiOptions): Handler {
  const { db, filesDir, now } = options;

  const fetchTimeoutMs = options.fetchTimeoutMs;

  return async (req, res) => {
    const host = req.headers.host ?? '';
    if (!HOST_ALLOWED.test(host)) {
      sendJson(res, 403, { error: 'requests are answered for localhost only (C3)' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${host}`);
    const method = req.method ?? 'GET';

    try {
      await route(url, method, req, res);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        sendJson(res, 400, { error: 'invalid request body', issues: error.issues });
        return;
      }
      if (error instanceof JobFetchError) {
        sendJson(res, error.httpStatus, { error: error.message });
        return;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'internal error' });
    }
  };

  async function route(
    url: URL,
    method: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const parts = url.pathname.split('/').filter((p) => p !== '');
    // All routes live under /api.
    if (parts[0] !== 'api') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    const [, resource, id, sub] = parts;

    if (resource === 'health' && method === 'GET') {
      sendJson(res, 200, { ok: true });
      return;
    }

    // ── candidates ─────────────────────────────────────────────────────────
    if (resource === 'candidates') {
      if (method === 'POST' && id === undefined) {
        const filename = url.searchParams.get('filename');
        if (filename === null || filename.trim() === '') {
          sendJson(res, 400, { error: 'filename query parameter is required' });
          return;
        }
        const bytes = await readBody(req);
        const { referenceDate } = now();
        const ingested = await ingestCandidateDocument(
          db,
          filesDir,
          bytes,
          filename,
          referenceDate,
        );
        sendJson(res, 201, {
          candidate: ingested.candidate,
          outcome: ingested.outcome,
          alreadyExisted: ingested.alreadyExisted,
        });
        return;
      }
      if (method === 'GET' && id === undefined) {
        sendJson(res, 200, { candidates: listCandidates(db) });
        return;
      }
      if (id !== undefined && sub === undefined) {
        const candidate = getCandidateById(db, id);
        if (method === 'GET') {
          if (candidate === null) sendJson(res, 404, { error: 'unknown candidate' });
          else sendJson(res, 200, { candidate });
          return;
        }
        if (method === 'DELETE') {
          if (deleteCandidate(db, filesDir, id)) res.writeHead(204).end();
          else sendJson(res, 404, { error: 'unknown candidate' });
          return;
        }
      }
    }

    // ── jobs ───────────────────────────────────────────────────────────────
    if (resource === 'jobs') {
      if (method === 'POST' && id === undefined) {
        const filename = url.searchParams.get('filename');
        const title = url.searchParams.get('title');
        if (filename === null || title === null || title.trim() === '') {
          sendJson(res, 400, { error: 'filename and title query parameters are required' });
          return;
        }
        const bytes = await readBody(req);
        const ingested = await ingestJobDocument(db, filesDir, bytes, filename, title);
        sendJson(res, 201, { job: ingested.job, outcome: ingested.outcome });
        return;
      }
      if (method === 'POST' && id === 'from-url' && sub === undefined) {
        // ADR-037: the product's only outbound network action. A browser page
        // from another origin must not be able to make this machine issue
        // fetches (blind-SSRF via CSRF): browsers always attach Origin to
        // cross-origin POSTs, so an Origin that is present and not local is
        // refused. Non-browser clients (curl) send no Origin and pass.
        const origin = req.headers.origin;
        if (origin !== undefined) {
          let originHost: string;
          try {
            originHost = new URL(origin).host;
          } catch {
            // "null" from a sandboxed context, or garbage: no valid origin
            // host exists, and the sentinel can never pass HOST_ALLOWED.
            originHost = 'unparseable-origin';
          }
          if (!HOST_ALLOWED.test(originHost)) {
            sendJson(res, 403, {
              error: 'cross-origin requests may not trigger link fetches (ADR-037)',
            });
            return;
          }
        }

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse((await readBody(req)).toString('utf8'));
        } catch {
          sendJson(res, 400, {
            error: 'request body must be JSON: {"url": "...", "title"?: "..."}',
          });
          return;
        }
        const { url: link, title: givenTitle } = JobFromUrlSchema.parse(parsedBody);

        const fetched = await fetchJobSource(link, fetchTimeoutMs);
        const title = (givenTitle ?? '').trim() || fetched.pageTitle || new URL(link).hostname;
        const ingested = await ingestJobDocument(
          db,
          filesDir,
          fetched.bytes,
          fetched.filename,
          title,
          link,
        );
        sendJson(res, 201, { job: ingested.job, outcome: ingested.outcome });
        return;
      }
      if (method === 'GET' && id === undefined) {
        const configured = new Set(
          db
            .prepare<[], { job_id: string }>('SELECT job_id FROM job_scoring_configs')
            .all()
            .map((r) => r.job_id),
        );
        sendJson(res, 200, {
          jobs: listJobs(db).map((j) => ({ ...j, configured: configured.has(j.id) })),
        });
        return;
      }

      if (id !== undefined) {
        const job = getJobById(db, id);
        if (job === null) {
          sendJson(res, 404, { error: 'unknown job' });
          return;
        }

        if (sub === undefined && method === 'GET') {
          sendJson(res, 200, { job });
          return;
        }
        if (sub === undefined && method === 'DELETE') {
          deleteJob(db, filesDir, id);
          res.writeHead(204).end();
          return;
        }

        if (sub === 'proposal' && method === 'GET') {
          // A job we could not read proposes nothing (PRODUCT_DECISIONS): the
          // recruiter fixes the document, not the proposal.
          if (job.parseStatus !== 'ok' || job.language !== 'en') {
            sendJson(res, 409, {
              error: 'job document is not readable; requirements cannot be proposed',
              parseStatus: job.parseStatus,
              warnings: job.warnings,
            });
            return;
          }
          sendJson(res, 200, { proposal: proposeRequirements(job.rawText, now().referenceDate) });
          return;
        }

        if (sub === 'config' && method === 'PUT') {
          const body = await readBody(req);
          const config = JobScoringConfigSchema.parse(JSON.parse(body.toString('utf8')));
          sendJson(res, 200, { config: upsertJobScoringConfig(db, id, config) });
          return;
        }
        if (sub === 'config' && method === 'GET') {
          const config = getJobScoringConfig(db, id);
          if (config === null) sendJson(res, 404, { error: 'no confirmed scoring config' });
          else sendJson(res, 200, { config });
          return;
        }

        if (sub === 'score' && method === 'POST') {
          const scoringJob = scoringJobFor(db, id);
          if (scoringJob === null) {
            // Unconfirmed means NOT scoreable — never "score with defaults".
            sendJson(res, 409, { error: 'confirm a scoring config before scoring' });
            return;
          }
          const { referenceDate, computedAt } = now();
          const outcome = scoreJobAgainstCandidates(
            db,
            scoringJob,
            listCandidates(db),
            referenceDate,
            computedAt,
          );
          sendJson(res, 200, outcome);
          return;
        }

        if (sub === 'matches' && method === 'GET') {
          sendJson(res, 200, { matches: listMatchesForJob(db, id) });
          return;
        }
      }
    }

    sendJson(res, 404, { error: 'not found' });
  }
}
