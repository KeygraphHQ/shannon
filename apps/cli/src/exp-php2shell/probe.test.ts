import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { runPhp2shellProbe } from './probe.js';

interface Scripted {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

async function startHost(control: Scripted, probe: Scripted): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const chosen = Buffer.concat(chunks).length > 100_000 ? probe : control;
      res.writeHead(chosen.status, chosen.headers ?? {});
      res.end(chosen.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('detects a crash from an in-band fatal memory error', async () => {
  const host = await startHost(
    { status: 200, body: 'x'.repeat(1200) },
    { status: 500, body: 'Fatal error: Allowed memory size exhausted in Unknown on line 0' },
  );
  try {
    const report = await runPhp2shellProbe({ url: host.url, timeoutMs: 5000 });
    assert.equal(report.verdict, 'detected');
    assert.equal(report.signal, 'fatal-error-in-band');
  } finally {
    await host.close();
  }
});

test('reports not detected on a patched version header with no crash', async () => {
  const patched = { status: 200, headers: { 'X-Powered-By': 'PHP/8.3.36' }, body: 'ok' };
  const host = await startHost(patched, patched);
  try {
    const report = await runPhp2shellProbe({ url: host.url, timeoutMs: 5000 });
    assert.equal(report.verdict, 'not_detected');
    assert.equal(report.signal, 'version-patched');
  } finally {
    await host.close();
  }
});

test('reports inconclusive when an edge layer rejects the probe', async () => {
  const host = await startHost({ status: 200, body: 'ok' }, { status: 413, body: 'Payload Too Large' });
  try {
    const report = await runPhp2shellProbe({ url: host.url, timeoutMs: 5000 });
    assert.equal(report.verdict, 'inconclusive');
    assert.equal(report.signal, 'edge-blocked');
  } finally {
    await host.close();
  }
});

test('escalates to the full-size probe when the small probe does not detect', async () => {
  const fatal = 'Fatal error: Allowed memory size exhausted in Unknown on line 0';
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const len = Buffer.concat(chunks).length;
      if (len > 4_000_000) {
        res.writeHead(200);
        res.end(fatal);
      } else if (len > 100_000) {
        res.writeHead(200);
        res.end('ok');
      } else {
        res.writeHead(200);
        res.end('x'.repeat(1200));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const report = await runPhp2shellProbe({ url: `http://127.0.0.1:${port}`, timeoutMs: 5000 });
    assert.equal(report.verdict, 'detected');
    assert.equal(report.signal, 'fatal-error-in-band');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('keeps the small probe verdict when the full probe is rejected at the edge', async () => {
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const len = Buffer.concat(chunks).length;
      if (len > 4_000_000) {
        res.writeHead(413);
        res.end('Payload Too Large');
      } else {
        res.writeHead(200, { 'X-Powered-By': 'PHP/8.4.27' });
        res.end(len > 100_000 ? 'ok-small' : 'x'.repeat(1200));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const report = await runPhp2shellProbe({ url: `http://127.0.0.1:${port}`, timeoutMs: 5000 });
    assert.equal(report.verdict, 'not_detected');
    assert.equal(report.signal, 'version-patched');
    assert.equal(report.version?.rawValue, 'PHP/8.4.27');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('reports the probed URL on the result', async () => {
  const host = await startHost({ status: 200, body: 'x'.repeat(1200) }, { status: 200, body: '' });
  try {
    const url = `${host.url}/login`;
    const report = await runPhp2shellProbe({ url, timeoutMs: 5000 });
    assert.equal(report.url, url);
    assert.equal(report.verdict, 'detected');
  } finally {
    await host.close();
  }
});

test('a full-probe timeout surfaces as inconclusive and is not masked by the smaller probe', async () => {
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.on('error', () => undefined);
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const len = Buffer.concat(chunks).length;
      if (len > 4_000_000) {
        // Full-size probe: never respond before the deadline, so the probe times out.
        setTimeout(() => {
          if (!res.writableEnded) res.end('late');
        }, 2000).unref();
      } else if (len > 100_000) {
        // Smaller probe reaches PHP, does not crash, and carries no version header.
        res.writeHead(200);
        res.end('ok-small');
      } else {
        // Healthy control.
        res.writeHead(200);
        res.end('x'.repeat(1200));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const report = await runPhp2shellProbe({ url: `http://127.0.0.1:${port}`, timeoutMs: 300 });
    assert.equal(report.verdict, 'inconclusive');
    assert.equal(report.signal, 'probe-timeout');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
