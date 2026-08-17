import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createStaticHandler } from './static.js';

describe('static handler (ADR-036)', () => {
  let root: string;
  let outside: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'matchdesk-web-'));
    outside = mkdtempSync(path.join(tmpdir(), 'matchdesk-secret-'));
    writeFileSync(path.join(root, 'index.html'), '<h1>shell</h1>');
    writeFileSync(path.join(root, 'app.mjs'), 'export {};');
    mkdirSync(path.join(root, 'lib'));
    writeFileSync(path.join(root, 'lib', 'x.mjs'), 'export {};');
    writeFileSync(path.join(outside, 'secret.txt'), 'candidate PII');
    symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'leak.html'));

    const handler = createStaticHandler(root);
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('serves the shell at / with a CSP that pins everything to self', async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await r.text()).toContain('shell');
  });

  it('serves nested modules with the module content type', async () => {
    const r = await fetch(`${base}/lib/x.mjs`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/javascript');
  });

  it('refuses path traversal', async () => {
    // fetch normalizes ../ before sending, so send the encoded form an
    // attacker would.
    const r = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    expect([403, 404]).toContain(r.status);
    const r2 = await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`);
    expect([403, 404]).toContain(r2.status);
  });

  it('refuses to follow a symlink out of the web root', async () => {
    const r = await fetch(`${base}/leak.html`);
    expect(r.status).toBe(403);
  });

  it('refuses unknown extensions rather than guessing a type', async () => {
    writeFileSync(path.join(root, 'notes.txt'), 'x');
    const r = await fetch(`${base}/notes.txt`);
    expect(r.status).toBe(404);
  });
});
