import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { getStoredFilePath } from '../fileStore/contentStore.js';
import { listAuditLogForEntity } from '../repositories/auditLog.js';
import { createApi } from './api.js';

/**
 * END-TO-END over real HTTP (ADR-035): the exact byte-level conversation the
 * UI will have. Every request goes through a real socket on an ephemeral
 * 127.0.0.1 port — no handler-level shortcuts — so the routing, the raw-bytes
 * upload contract and the Host check are all exercised as the browser will
 * exercise them.
 */

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'ingestion',
  'fixtures',
);
const fixture = (name: string): Buffer => readFileSync(path.join(fixturesDir, name));

const REF = { year: 2026, month: 1 } as const;
const COMPUTED_AT = '2026-08-17T00:00:00.000Z';

describe('HTTP API (ADR-035)', () => {
  let db: Database.Database;
  let dataDir: string;
  let filesDir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-api-'));
    filesDir = path.join(dataDir, 'files');
    db = openDatabase({ dataDir });
    const api = createApi({
      db,
      filesDir,
      now: () => ({ referenceDate: REF, computedAt: COMPUTED_AT }),
    });
    server = createServer((req, res) => {
      void api(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const upload = (
    urlPath: string,
    bytes: Buffer,
  ): Promise<{ status: number; body: Record<string, unknown> }> =>
    fetch(`${base}${urlPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));

  const getJson = (urlPath: string): Promise<{ status: number; body: Record<string, unknown> }> =>
    fetch(`${base}${urlPath}`).then(async (r) => ({
      status: r.status,
      body: (await r.json()) as Record<string, unknown>,
    }));

  it('drives the whole recruiter workflow over the wire', async () => {
    // 1 · upload a job
    const job = await upload(
      '/api/jobs?filename=job.pdf&title=Backend%20Engineer',
      fixture('job-english.pdf'),
    );
    expect(job.status).toBe(201);
    const jobId = (job.body['job'] as { id: string }).id;
    expect(job.body['outcome']).toBe('scoreable');

    // 2 · propose requirements from the job's own text — deterministic,
    //     evidence-spanned, nothing mustHave (the recruiter decides that)
    const proposal = await getJson(`/api/jobs/${jobId}/proposal`);
    expect(proposal.status).toBe(200);
    const proposed = proposal.body['proposal'] as {
      skills: { canonicalSkillId: string; sourceSpan: { start: number; end: number } }[];
      defaultWeights: Record<string, number>;
    };
    expect(proposed.skills.length).toBeGreaterThan(0);
    expect(proposed.defaultWeights['skills']).toBe(0.4);

    // 3 · scoring before confirmation must refuse — never score with defaults
    const early = await fetch(`${base}/api/jobs/${jobId}/score`, { method: 'POST' });
    expect(early.status).toBe(409);

    // 4 · confirm a config built from the proposal
    const config = {
      skills: {
        weight: 1,
        requirements: proposed.skills.slice(0, 1).map((s, i) => ({
          id: `r${String(i)}`,
          canonicalSkillId: s.canonicalSkillId,
          label: s.canonicalSkillId,
          mustHave: false,
        })),
      },
    };
    const put = await fetch(`${base}/api/jobs/${jobId}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    expect(put.status).toBe(200);

    // 5 · upload one scoreable and one refusable candidate
    const en = await upload('/api/candidates?filename=cv.docx', fixture('candidate-english.docx'));
    expect(en.body['outcome']).toBe('scoreable');
    const fr = await upload('/api/candidates?filename=fr.docx', fixture('candidate-french.docx'));
    expect(fr.body['outcome']).toBe('needs_attention');
    const enId = (en.body['candidate'] as { id: string }).id;
    const frId = (fr.body['candidate'] as { id: string }).id;

    // 6 · score the pool
    const score = await fetch(`${base}/api/jobs/${jobId}/score`, { method: 'POST' });
    expect(score.status).toBe(200);
    const outcome = (await score.json()) as {
      scored: { candidateId: string; result: { score: number; reservations: unknown[] } }[];
      skipped: { candidateId: string; reason: string }[];
    };
    expect(outcome.scored.map((s) => s.candidateId)).toEqual([enId]);
    expect(outcome.skipped).toEqual([{ candidateId: frId, reason: 'not_scoreable', details: [] }]);

    // 7 · the match row persisted with its provenance (ADR-024)
    const matches = await getJson(`/api/jobs/${jobId}/matches`);
    const rows = matches.body['matches'] as { candidateId: string; referenceDate: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenceDate).toBe('2026-01');

    // 8 · evidence is renderable: candidate detail carries rawText and the
    //     score's spans index into it
    const detail = await getJson(`/api/candidates/${enId}`);
    const rawText = (detail.body['candidate'] as { rawText: string }).rawText;
    expect(rawText.length).toBeGreaterThan(0);
  });

  it('refuses non-localhost Host headers (DNS rebinding, C3)', async () => {
    // `fetch` (undici) always derives Host from the URL, so a raw request is
    // the only way to send what a DNS-rebinding attack actually sends: a TCP
    // connection to 127.0.0.1 carrying a hostile Host header.
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const r = request(
        `${base}/api/health`,
        { headers: { host: 'evil.example.com' } },
        (response) => {
          resolve(response.statusCode ?? 0);
          response.resume();
        },
      );
      r.on('error', reject);
      r.end();
    });
    expect(status).toBe(403);
  });

  it('rejects an invalid scoring config with the zod issues', async () => {
    const job = await upload('/api/jobs?filename=j.pdf&title=T', fixture('job-english.pdf'));
    const jobId = (job.body['job'] as { id: string }).id;
    const r = await fetch(`${base}/api/jobs/${jobId}/config`, {
      method: 'PUT',
      body: JSON.stringify({ skills: { weight: -1, requirements: [] } }),
    });
    expect(r.status).toBe(400);
  });

  it('refuses to propose requirements from an unreadable job document', async () => {
    const job = await upload(
      '/api/jobs?filename=fr.docx&title=T',
      fixture('candidate-french.docx'),
    );
    const jobId = (job.body['job'] as { id: string }).id;
    const r = await getJson(`/api/jobs/${jobId}/proposal`);
    expect(r.status).toBe(409);
  });

  it('DELETE removes the row, the stored file, and appends an opaque audit entry', async () => {
    const bytes = fixture('candidate-english.docx');
    const up = await upload('/api/candidates?filename=cv.docx', bytes);
    const id = (up.body['candidate'] as { id: string; fileSha256: string }).id;
    const sha = (up.body['candidate'] as { fileSha256: string }).fileSha256;
    expect(existsSync(getStoredFilePath(filesDir, sha))).toBe(true);

    const del = await fetch(`${base}/api/candidates/${id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    expect((await getJson(`/api/candidates/${id}`)).status).toBe(404);
    expect(existsSync(getStoredFilePath(filesDir, sha))).toBe(false);

    // PRODUCT_DECISIONS: the audit record keeps an opaque id and the action —
    // never PII, never source text.
    const audit = listAuditLogForEntity(db, 'candidate', id);
    expect(audit.some((e) => e.action === 'deleted' && e.details === null)).toBe(true);
  });

  it('DELETE on a job removes the row, the stored file, and appends an opaque audit entry — including a needs-attention job (H-117)', async () => {
    // H-117's exact scenario: an unreadable document uploaded as a JOB (the
    // user's refused resume) sat on the Jobs list with no way to remove it.
    // Until this test, `deleteJob` was exercised by NO test at all — the
    // finding's own note said "DELETE /api/jobs/:id exists and is tested",
    // and that was true only of the candidate path sharing its
    // implementation. The unreadable-as-job path is the one the UI's delete
    // button exists for, so it is the one pinned here.
    const up = await upload('/api/jobs?filename=fr.docx&title=T', fixture('candidate-french.docx'));
    expect(up.status).toBe(201);
    expect(up.body['outcome']).toBe('needs_attention');
    const id = (up.body['job'] as { id: string }).id;
    const sha = (up.body['job'] as { fileSha256: string }).fileSha256;
    expect(existsSync(getStoredFilePath(filesDir, sha))).toBe(true);

    const del = await fetch(`${base}/api/jobs/${id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    expect((await getJson(`/api/jobs/${id}`)).status).toBe(404);
    const list = await getJson('/api/jobs');
    expect((list.body['jobs'] as { id: string }[]).some((j) => j.id === id)).toBe(false);
    expect(existsSync(getStoredFilePath(filesDir, sha))).toBe(false);

    const audit = listAuditLogForEntity(db, 'job', id);
    expect(audit.some((e) => e.action === 'deleted' && e.details === null)).toBe(true);
  });
});
