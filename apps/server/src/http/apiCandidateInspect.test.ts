import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { listMatchesForJob } from '../repositories/matches.js';
import { createApi } from './api.js';

/**
 * ADR-038 end-to-end over a real socket (the ADR-035 pattern): the CV
 * inspect endpoint and the candidate-against-jobs scoring direction.
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

describe('candidate inspect + reverse scoring (ADR-038)', () => {
  let db: Database.Database;
  let dataDir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-inspect-'));
    db = openDatabase({ dataDir });
    const handler = createApi({
      db,
      filesDir: path.join(dataDir, 'files'),
      now: () => ({ referenceDate: REF, computedAt: COMPUTED_AT }),
    });
    server = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const upload = async (urlPath: string, bytes: Buffer): Promise<Record<string, unknown>> => {
    const r = await fetch(`${base}${urlPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    });
    return (await r.json()) as Record<string, unknown>;
  };
  const getJson = (urlPath: string): Promise<{ status: number; body: Record<string, unknown> }> =>
    fetch(`${base}${urlPath}`).then(async (r) => ({
      status: r.status,
      body: (await r.json()) as Record<string, unknown>,
    }));

  it('GET /attributes shows exactly what scoring reads: kinds, spans into rawText, and the tenure total', async () => {
    const up = await upload('/api/candidates?filename=cv.docx', fixture('candidate-english.docx'));
    const candidate = up['candidate'] as { id: string; rawText: string };

    const r = await getJson(`/api/candidates/${candidate.id}/attributes`);
    expect(r.status).toBe(200);
    const attributes = r.body['attributes'] as {
      kind: string;
      value: string;
      sourceSpan: { start: number; end: number };
    }[];
    const kinds = new Set(attributes.map((a) => a.kind));
    expect(kinds.has('skill')).toBe(true);
    expect(kinds.has('education')).toBe(true);

    // Every span must point at the exact evidence text in the stored
    // document — this is what the inspect view highlights.
    for (const a of attributes) {
      expect(candidate.rawText.slice(a.sourceSpan.start, a.sourceSpan.end)).toBe(a.value);
    }

    // This fixture states its tenure in WORDS ("five years of experience"),
    // and the extractor deliberately parses digits only — so the honest
    // total here is 0, and the inspect view will show exactly that. This is
    // precisely the kind of fact the view exists to make visible instead of
    // leaving the recruiter to wonder (the user's own report: "I do not
    // know whether it worked fully or not").
    expect(kinds.has('years_experience')).toBe(false);
    expect(r.body['totalYearsExperience']).toBe(0);
    expect(r.body['referenceDate']).toEqual(REF);
  });

  it('GET /attributes refuses an unreadable candidate with 409, like the proposal route (C7)', async () => {
    const up = await upload('/api/candidates?filename=fr.docx', fixture('candidate-french.docx'));
    const id = (up['candidate'] as { id: string }).id;
    const r = await getJson(`/api/candidates/${id}/attributes`);
    expect(r.status).toBe(409);
  });

  it('POST /score evaluates one candidate against selected jobs, skipping the unconfigured and the unreadable with named reasons', async () => {
    const cand = (
      (await upload('/api/candidates?filename=cv.docx', fixture('candidate-english.docx'))) as {
        candidate: { id: string };
      }
    ).candidate;

    // Job A: readable and configured.
    const jobA = (
      (await upload('/api/jobs?filename=a.pdf&title=A', fixture('job-english.pdf'))) as {
        job: { id: string };
      }
    ).job;
    await fetch(`${base}/api/jobs/${jobA.id}/config`, {
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
    // Job B: readable, never configured.
    const jobB = (
      (await upload('/api/jobs?filename=b.pdf&title=B', fixture('job-english.pdf'))) as {
        job: { id: string };
      }
    ).job;
    // Job C: unreadable (French).
    const jobC = (
      (await upload('/api/jobs?filename=c.docx&title=C', fixture('candidate-french.docx'))) as {
        job: { id: string };
      }
    ).job;

    const r = await fetch(`${base}/api/candidates/${cand.id}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobIds: [jobA.id, jobB.id, jobC.id] }),
    });
    expect(r.status).toBe(200);
    const run = (await r.json()) as {
      scored: { jobId: string; result: { score: number } }[];
      skipped: { jobId: string; reason: string }[];
    };

    expect(run.scored.map((s) => s.jobId)).toEqual([jobA.id]);
    expect(run.scored[0]?.result.score).toBeGreaterThan(0);
    expect(run.skipped.find((k) => k.jobId === jobB.id)?.reason).toBe('not_configured');
    expect(run.skipped.find((k) => k.jobId === jobC.id)?.reason).toBe('not_scoreable');

    // The same match row the job-side run would persist (ADR-024).
    const matches = listMatchesForJob(db, jobA.id);
    expect(matches.some((m) => m.candidateId === cand.id)).toBe(true);
  });

  it('POST /score with no body means "all jobs", and an unreadable candidate is 409, never scored', async () => {
    const cand = (
      (await upload('/api/candidates?filename=cv.docx', fixture('candidate-english.docx'))) as {
        candidate: { id: string };
      }
    ).candidate;
    const empty = await fetch(`${base}/api/candidates/${cand.id}/score`, { method: 'POST' });
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { scored: unknown[] }).scored).toEqual([]);

    const fr = (
      (await upload('/api/candidates?filename=fr.docx', fixture('candidate-french.docx'))) as {
        candidate: { id: string };
      }
    ).candidate;
    const refused = await fetch(`${base}/api/candidates/${fr.id}/score`, { method: 'POST' });
    expect(refused.status).toBe(409);
  });

  it('POST /score with an unknown job id is a 404, not a silent skip', async () => {
    const cand = (
      (await upload('/api/candidates?filename=cv.docx', fixture('candidate-english.docx'))) as {
        candidate: { id: string };
      }
    ).candidate;
    const r = await fetch(`${base}/api/candidates/${cand.id}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobIds: ['01NOTAREALJOBID0000000000'] }),
    });
    expect(r.status).toBe(404);
  });
});
