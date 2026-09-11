/**
 * Local test application server.
 *
 * Used only by tests to give the "live" recon/JS/behavioral pipelines a
 * real HTTP server to talk to — real sockets, real HTML/JS/source-map
 * content, real per-request behavior differences — without ever
 * contacting anything outside 127.0.0.1. This is the "local deterministic
 * test application environment" the implementation plan calls for.
 *
 * The `/api/admin/users` endpoint is deliberately vulnerable (it returns
 * the same privileged body to an anonymous request as to a privileged
 * one) so the live behavioral-diff pipeline has a real anomaly to find —
 * this is a fixture bug, not a real application.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface LocalTestApp {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

const HTML_PAGE = `<!doctype html>
<html>
<head><title>Test App</title></head>
<body>
  <div id="results"></div>
  <script src="/app.js"></script>
</body>
</html>`;

const APP_JS = `
const params = new URLSearchParams(location.search);
const q = params.get('q');
document.getElementById('results').innerHTML = q;
fetch('/api/v2/results?cursor=1');
//# sourceMappingURL=/app.js.map
`;

// A second, independent JS bundle — the local E2E target deliberately
// serves more than one real script file (this one has no source map), so a
// live JS-collection run genuinely has more than one file to fetch and
// analyze.
const ADMIN_JS = `
function loadAdminPanel() {
  fetch('/api/admin/users').then((r) => r.json());
  fetch('/api/admin/workflow/approve?step=2');
}
loadAdminPanel();
`;

const ADMIN_PAGE = `<!doctype html>
<html>
<head><title>Admin</title></head>
<body>
  <div id="admin-panel"></div>
  <script src="/admin.js"></script>
</body>
</html>`;

const SOURCE_MAP = JSON.stringify({
  version: 3,
  file: 'app.js',
  sources: ['src/search.ts'],
  sourcesContent: [
    '// original TypeScript source, recovered via the source map\nexport function render(q: string): void {\n  document.getElementById("results")!.innerHTML = q;\n}\nfetch("/internal/admin/debug");\n',
  ],
  names: [],
  mappings: '',
});

const PRIVILEGED_ADMIN_BODY = JSON.stringify({ users: [{ id: 1, name: 'admin' }] });

function handleAdminUsers(role: string | undefined): { status: number; body: string } {
  // Intentional fixture bug: anonymous and privileged-user both succeed.
  if (role === 'privileged-user' || role === undefined || role === 'anonymous') {
    return { status: 200, body: PRIVILEGED_ADMIN_BODY };
  }
  return { status: 403, body: JSON.stringify({ error: 'forbidden' }) };
}

export function startLocalTestApp(): Promise<LocalTestApp> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(HTML_PAGE);
        return;
      }
      if (url.pathname === '/app.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' });
        res.end(APP_JS);
        return;
      }
      if (url.pathname === '/app.js.map') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(SOURCE_MAP);
        return;
      }
      if (url.pathname === '/admin') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(ADMIN_PAGE);
        return;
      }
      if (url.pathname === '/admin.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' });
        res.end(ADMIN_JS);
        return;
      }
      if (url.pathname === '/api/admin/workflow/approve') {
        // A simple two-step workflow/state transition: step 1 must precede step 2.
        const step = url.searchParams.get('step');
        if (step === '1') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'pending', next: 2 }));
          return;
        }
        if (step === '2') {
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'step 1 has not been completed' }));
          return;
        }
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing step parameter' }));
        return;
      }
      if (url.pathname === '/search') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body>results for ${url.searchParams.get('q') ?? ''}</body></html>`);
        return;
      }
      if (url.pathname === '/api/admin/users') {
        const role = req.headers['x-test-role'];
        const { status, body } = handleAdminUsers(typeof role === 'string' ? role : undefined);
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(body);
        return;
      }
      if (url.pathname === '/hidden') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('found by active recon');
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      if (address === null) {
        reject(new Error('failed to bind local test server'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}
