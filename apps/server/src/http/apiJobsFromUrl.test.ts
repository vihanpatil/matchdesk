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
 * ADR-037 end-to-end, in the ADR-035 style: real sockets on both sides. The
 * API runs on one ephemeral 127.0.0.1 port and a second local server plays
 * the job board, serving the synthetic fixtures — no test ever fetches a
 * real site (ADR-014), and the whole fetch → extract → gate → store →
 * propose → score → delete chain runs exactly as production wires it.
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

describe('POST /api/jobs/from-url (ADR-037)', () => {
  let db: Database.Database;
  let dataDir: string;
  let filesDir: string;
  let api: Server;
  let base: string;
  let board: Server;
  let boardBase: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-fromurl-'));
    filesDir = path.join(dataDir, 'files');
    db = openDatabase({ dataDir });
    const handler = createApi({
      db,
      filesDir,
      now: () => ({ referenceDate: REF, computedAt: COMPUTED_AT }),
      fetchTimeoutMs: 1500,
    });
    api = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
    const apiAddress = api.address();
    if (apiAddress === null || typeof apiAddress === 'string') throw new Error('no api port');
    base = `http://127.0.0.1:${String(apiAddress.port)}`;

    // The stand-in job board.
    board = createServer((req, res) => {
      const route = req.url ?? '/';
      if (route === '/jobs/4187-senior-backend-engineer') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fixture('job-posting.html'));
      } else if (route === '/jobs/fr') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fixture('job-posting-french.html'));
      } else if (route === '/jobs/spa') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fixture('job-posting-spa.html'));
      } else if (route === '/jobs/as-pdf') {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.end(fixture('job-english.pdf'));
      } else if (route === '/jobs/csv') {
        res.writeHead(200, { 'content-type': 'text/csv' });
        res.end('title,team\nEngineer,Platform\n');
      } else if (route === '/jobs/slow') {
        // Deliberately never answers; the API's fetch timeout must fire.
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    });
    await new Promise<void>((resolve) => board.listen(0, '127.0.0.1', resolve));
    const boardAddress = board.address();
    if (boardAddress === null || typeof boardAddress === 'string') throw new Error('no board port');
    boardBase = `http://127.0.0.1:${String(boardAddress.port)}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => api.close(resolve));
    await new Promise((resolve) => board.close(resolve));
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const fromUrl = (
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> =>
    fetch(`${base}/api/jobs/from-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));

  it('drives the whole recruiter workflow from a pasted link: fetch → propose → confirm → score → delete', async () => {
    const url = `${boardBase}/jobs/4187-senior-backend-engineer`;
    const created = await fromUrl({ url });
    expect(created.status).toBe(201);
    expect(created.body['outcome']).toBe('scoreable');

    const job = created.body['job'] as {
      id: string;
      title: string;
      originalFilename: string;
      sourceUrl: string;
      fileSha256: string;
      language: string;
    };
    // No title given → the page's own <title>, entities decoded.
    expect(job.title).toBe('Senior Backend Engineer – Meridian Analytics');
    expect(job.sourceUrl).toBe(url);
    expect(job.originalFilename).toMatch(/^127-0-0-1-4187-senior-backend-engineer\.html$/);
    expect(job.language).toBe('en');
    // The fetched bytes are stored content-addressed, exactly like an upload.
    expect(existsSync(getStoredFilePath(filesDir, job.fileSha256))).toBe(true);

    // The proposal comes from the extracted page text.
    const proposal = (await (await fetch(`${base}/api/jobs/${job.id}/proposal`)).json()) as {
      proposal: {
        skills: { canonicalSkillId: string }[];
        minYears: { years: number } | null;
        minDegreeLevel: { level: string } | null;
      };
    };
    const skillIds = proposal.proposal.skills.map((s) => s.canonicalSkillId);
    expect(skillIds).toContain('python');
    expect(skillIds).toContain('postgresql');
    expect(skillIds).toContain('docker');
    expect(proposal.proposal.minYears?.years).toBe(5);
    expect(proposal.proposal.minDegreeLevel?.level).toBe('bachelor');

    // Confirm a config and score a real candidate against the linked job.
    const up = await fetch(`${base}/api/candidates?filename=cv.docx`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(fixture('candidate-english.docx')),
    });
    expect(up.status).toBe(201);
    const confirm = await fetch(`${base}/api/jobs/${job.id}/config`, {
      method: 'PUT',
      body: JSON.stringify({
        skills: {
          weight: 1,
          requirements: [
            { id: 'r0', canonicalSkillId: 'python', label: 'Python', mustHave: false },
          ],
        },
      }),
    });
    expect(confirm.status).toBe(200);
    const run = (await (
      await fetch(`${base}/api/jobs/${job.id}/score`, { method: 'POST' })
    ).json()) as { scored: { result: { score: number } }[] };
    expect(run.scored).toHaveLength(1);
    expect(run.scored[0]?.result.score).toBeGreaterThan(0);

    // And the destructive path (H-117's rule): delete it, prove it is gone.
    const del = await fetch(`${base}/api/jobs/${job.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await fetch(`${base}/api/jobs/${job.id}`)).status).toBe(404);
    expect(existsSync(getStoredFilePath(filesDir, job.fileSha256))).toBe(false);
    const audit = listAuditLogForEntity(db, 'job', job.id);
    expect(audit.some((e) => e.action === 'deleted' && e.details === null)).toBe(true);
  });

  it('a recruiter-supplied title beats the page title', async () => {
    const created = await fromUrl({
      url: `${boardBase}/jobs/4187-senior-backend-engineer`,
      title: 'Backend Hire Q3',
    });
    expect((created.body['job'] as { title: string }).title).toBe('Backend Hire Q3');
  });

  it('a link that serves a PDF goes through the PDF path unchanged', async () => {
    const created = await fromUrl({ url: `${boardBase}/jobs/as-pdf` });
    expect(created.status).toBe(201);
    expect(created.body['outcome']).toBe('scoreable');
    const job = created.body['job'] as { originalFilename: string; title: string };
    expect(job.originalFilename).toMatch(/\.pdf$/);
    // A PDF has no <title>; with none given, the hostname stands in.
    expect(job.title).toBe('127.0.0.1');
  });

  it('a French posting is refused exactly like a French upload (ADR-006, C7)', async () => {
    const created = await fromUrl({ url: `${boardBase}/jobs/fr` });
    expect(created.status).toBe(201);
    expect(created.body['outcome']).toBe('needs_attention');
    const job = created.body['job'] as { language: string | null; parseStatus: string };
    expect(job.language).toBeNull();
    expect(job.parseStatus).toBe('needs_attention');
  });

  it('a JavaScript-rendered shell is flagged with actionable guidance, not scored on its nav bar', async () => {
    const created = await fromUrl({ url: `${boardBase}/jobs/spa` });
    expect(created.status).toBe(201);
    expect(created.body['outcome']).toBe('needs_attention');
    const job = created.body['job'] as { warnings: string[] };
    expect(job.warnings.join(' ')).toContain('JavaScript');
  });

  it('maps failure causes to distinct statuses: bad URL 400, wrong scheme 400, HTTP error 502, non-document type 415, timeout 502', async () => {
    expect((await fromUrl({ url: 'not a url' })).status).toBe(400);
    expect((await fromUrl({ url: 'file:///etc/hosts' })).status).toBe(400);

    const missing = await fromUrl({ url: `${boardBase}/jobs/gone` });
    expect(missing.status).toBe(502);
    expect(String(missing.body['error'])).toContain('404');

    const csv = await fromUrl({ url: `${boardBase}/jobs/csv` });
    expect(csv.status).toBe(415);
    expect(String(csv.body['error'])).toContain('text/csv');

    const slow = await fromUrl({ url: `${boardBase}/jobs/slow` });
    expect(slow.status).toBe(502);
    expect(String(slow.body['error'])).toContain('did not respond');
  }, 15000);

  it('refuses a cross-origin browser request — no other page may make this machine fetch links (ADR-037)', async () => {
    const forbidden = await fromUrl(
      { url: `${boardBase}/jobs/4187-senior-backend-engineer` },
      { origin: 'https://evil.example.com' },
    );
    expect(forbidden.status).toBe(403);

    // The UI's own same-origin requests carry a local Origin and pass.
    const allowed = await fromUrl(
      { url: `${boardBase}/jobs/4187-senior-backend-engineer` },
      { origin: base },
    );
    expect(allowed.status).toBe(201);
  });

  it('rejects a non-JSON body with 400, not a stack trace', async () => {
    const r = await fetch(`${base}/api/jobs/from-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'url=this-is-not-json',
    });
    expect(r.status).toBe(400);
  });
});
