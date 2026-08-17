import { existsSync, readFileSync, realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

/**
 * Static file serving for the UI (ADR-036). Same server, same origin as the
 * API — which is why the API needs no CORS and the browser's same-origin
 * policy does real work for us.
 *
 * Hardened the only two ways a static handler needs to be:
 * - **Path traversal**: the resolved real path must stay inside the web root.
 *   Checked against `realpathSync`, so a symlink cannot re-open what string
 *   prefix checks would close.
 * - **CSP**: `default-src 'self'` — the app shell may load nothing from
 *   anywhere else, which is C3's "no candidate data leaves the machine"
 *   extended to "and the page cannot phone anywhere either".
 */

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'";

export function createStaticHandler(
  webRoot: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  const root = realpathSync(webRoot);

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Hash routing means only `/` needs the shell; everything else is a file.
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const resolved = path.resolve(root, rel);

    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(resolved)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    // realpath AFTER existence: a symlink inside the root pointing outside it
    // must not be followed out of the sandbox.
    const real = realpathSync(resolved);
    if (!real.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }

    const type = CONTENT_TYPES[path.extname(real)];
    if (type === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': type,
      'content-security-policy': CSP,
      'cache-control': 'no-cache',
    });
    res.end(readFileSync(real));
  };
}
