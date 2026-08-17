import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '../db/connection.js';
import { getDataDir, getFilesDir } from '../db/paths.js';
import { createApi } from './api.js';
import { createStaticHandler } from './static.js';

/**
 * The entry point (ADR-035): `pnpm serve` from the repo root.
 *
 * Binds 127.0.0.1 ONLY — never 0.0.0.0. C3 (local data sovereignty) is
 * enforced at the socket, not by a config flag someone can forget: there is
 * no option to widen the bind.
 */
const port = Number(process.env['MATCHDESK_PORT'] ?? 3900);
const dataDir = getDataDir();
const db = openDatabase({ dataDir });

const api = createApi({
  db,
  filesDir: getFilesDir(dataDir),
  now: () => {
    const d = new Date();
    return {
      referenceDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 },
      computedAt: d.toISOString(),
    };
  },
});

// The UI ships as static files from apps/web/public — same origin as the
// API, so the browser's same-origin policy does the CORS work (ADR-036).
const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../web/public');
const serveStatic = createStaticHandler(webRoot);

createServer((req, res) => {
  if ((req.url ?? '/').startsWith('/api')) void api(req, res);
  else serveStatic(req, res);
}).listen(port, '127.0.0.1', () => {
  // warn, not log: the repo's no-console rule allows only warn/error, and a
  // server MUST announce its address — this is operator output, not debug.
  console.warn(`MatchDesk API listening on http://127.0.0.1:${String(port)}`);
  console.warn(`Data directory: ${dataDir}`);
});
