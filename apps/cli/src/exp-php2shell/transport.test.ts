import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { buildControlBody } from './multipart.js';
import { sendMultipart } from './transport.js';

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Drain the request body so the socket is not reset before the response is read. */
function drain(req: IncomingMessage, then: () => void): void {
  req.on('data', () => undefined);
  req.on('end', then);
}

test('a response larger than the retain cap reports the full length but retains at most 64 KiB', async () => {
  const bigBytes = 200 * 1024;
  const host = await listen((req, res) => {
    drain(req, () => {
      res.writeHead(200);
      res.end('x'.repeat(bigBytes));
    });
  });
  try {
    const response = await sendMultipart(host.url, 'POST', buildControlBody(), 5000);
    assert.equal(response.reachable, true);
    assert.equal(response.bodyLength, bigBytes, 'full byte length is counted');
    assert.ok(response.bodyText.length <= 64 * 1024, 'retained text is bounded');
  } finally {
    await host.close();
  }
});

test('a request that exceeds the deadline is reported as timed out, not a plain failure', async () => {
  const host = await listen((req, res) => {
    // Never respond within the deadline.
    drain(req, () => setTimeout(() => res.end('late'), 2000));
  });
  try {
    const response = await sendMultipart(host.url, 'POST', buildControlBody(), 100);
    assert.equal(response.reachable, false);
    assert.equal(response.timedOut, true);
  } finally {
    await host.close();
  }
});
