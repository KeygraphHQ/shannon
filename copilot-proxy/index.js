// Shannon Copilot Proxy
// Handles GitHub Copilot token exchange and proxies OpenAI-compatible requests
// to api.githubcopilot.com with auto-refreshing short-lived session tokens.
//
// Designed for concurrent use (5+ parallel agents) with serialized token refresh.

const http = require('http');
const https = require('https');

const PORT = parseInt(process.env.PORT || '8787', 10);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_CHAT_URL = 'https://api.githubcopilot.com/chat/completions';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const TOKEN_RETRY_ATTEMPTS = 3;
const TOKEN_RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 min per request (agents run long)

let cachedToken = null;
let tokenExpiresAt = 0;
let refreshPromise = null; // Serializes concurrent refresh attempts
let requestCount = 0;

// === Token Management ===

function fetchCopilotToken() {
  return new Promise((resolve, reject) => {
    const url = new URL(COPILOT_TOKEN_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'shannon-copilot-proxy/1.0',
        'Accept': 'application/json',
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Token exchange failed (HTTP ${res.statusCode}): ${body}`));
          return;
        }
        try {
          const data = JSON.parse(body);
          if (!data.token) {
            reject(new Error(`Token exchange response missing 'token' field: ${body}`));
            return;
          }
          resolve(data);
        } catch (e) {
          reject(new Error(`Failed to parse token response: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Token exchange request timed out'));
    });
    req.on('error', (e) => reject(new Error(`Token exchange request failed: ${e.message}`)));
    req.end();
  });
}

/** Fetch token with retry logic for transient failures. */
async function fetchCopilotTokenWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= TOKEN_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetchCopilotToken();
    } catch (e) {
      lastError = e;
      if (attempt < TOKEN_RETRY_ATTEMPTS) {
        const delay = TOKEN_RETRY_DELAY_MS * attempt;
        console.warn(`[copilot-proxy] Token refresh attempt ${attempt} failed: ${e.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Get a valid Copilot session token.
 * Serializes concurrent refresh requests — if multiple agents call this
 * simultaneously, only one refresh occurs and all callers share the result.
 */
async function getValidToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - REFRESH_MARGIN_MS) {
    return cachedToken;
  }

  // Serialize: if a refresh is already in flight, wait for it
  if (refreshPromise) {
    await refreshPromise;
    // After waiting, check if the refreshed token is still valid
    if (cachedToken && Date.now() < tokenExpiresAt - REFRESH_MARGIN_MS) {
      return cachedToken;
    }
  }

  // Start a new refresh — store the promise so concurrent callers can wait
  refreshPromise = (async () => {
    try {
      console.log('[copilot-proxy] Refreshing Copilot session token...');
      const data = await fetchCopilotTokenWithRetry();
      cachedToken = data.token;
      // expires_at is a Unix timestamp (seconds)
      tokenExpiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + 25 * 60 * 1000;
      console.log(`[copilot-proxy] Token refreshed, expires at ${new Date(tokenExpiresAt).toISOString()}`);
    } finally {
      refreshPromise = null;
    }
  })();

  await refreshPromise;
  return cachedToken;
}

// === Request Proxying ===

function proxyToCopilot(token, requestBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(COPILOT_CHAT_URL);
    const bodyStr = JSON.stringify(requestBody);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'shannon-copilot-proxy/1.0',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot/1.0.0',
        'Openai-Organization': 'github-copilot',
        'Openai-Intent': 'conversation-panel',
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    // Handle streaming vs non-streaming
    if (requestBody.stream) {
      const proxyReq = https.request(options, (proxyRes) => {
        resolve({ statusCode: proxyRes.statusCode, headers: proxyRes.headers, stream: proxyRes });
      });
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('Copilot API request timed out'));
      });
      proxyReq.on('error', (e) => reject(new Error(`Proxy request failed: ${e.message}`)));
      proxyReq.write(bodyStr);
      proxyReq.end();
    } else {
      const proxyReq = https.request(options, (proxyRes) => {
        let body = '';
        proxyRes.on('data', (chunk) => { body += chunk; });
        proxyRes.on('end', () => {
          resolve({ statusCode: proxyRes.statusCode, headers: proxyRes.headers, body });
        });
      });
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('Copilot API request timed out'));
      });
      proxyReq.on('error', (e) => reject(new Error(`Proxy request failed: ${e.message}`)));
      proxyReq.write(bodyStr);
      proxyReq.end();
    }
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// === HTTP Server ===

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === '/health') {
    const now = Date.now();
    const tokenValid = cachedToken && now < tokenExpiresAt - REFRESH_MARGIN_MS;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      tokenCached: !!cachedToken,
      tokenValid,
      tokenExpiresIn: tokenValid ? Math.round((tokenExpiresAt - now) / 1000) + 's' : 'expired',
      requestsServed: requestCount,
    }));
    return;
  }

  // Only handle POST to chat completions endpoint
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use POST /v1/chat/completions' }));
    return;
  }

  const reqId = ++requestCount;
  const startTime = Date.now();

  try {
    // 1. Get a valid Copilot session token
    const token = await getValidToken();

    // 2. Read and parse the request body
    const rawBody = await readRequestBody(req);
    let requestBody;
    try {
      requestBody = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      return;
    }

    const model = requestBody.model || 'unknown';
    const streaming = !!requestBody.stream;
    console.log(`[copilot-proxy] #${reqId} ${model} stream=${streaming}`);

    // 3. Proxy to Copilot API
    const result = await proxyToCopilot(token, requestBody);

    // 4. Handle non-200 responses from Copilot
    if (result.statusCode >= 400) {
      const errorBody = result.body || '';
      const elapsed = Date.now() - startTime;
      console.error(`[copilot-proxy] #${reqId} Copilot API error ${result.statusCode} (${elapsed}ms): ${errorBody.slice(0, 200)}`);

      // If auth error (401/403), invalidate cached token so next request refreshes
      if (result.statusCode === 401 || result.statusCode === 403) {
        cachedToken = null;
        tokenExpiresAt = 0;
        console.warn('[copilot-proxy] Invalidated cached token due to auth error');
      }
    }

    // 5. Stream or return the response
    if (result.stream) {
      // Streaming response — pipe directly
      res.writeHead(result.statusCode, {
        'Content-Type': result.headers['content-type'] || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      result.stream.pipe(res);
      result.stream.on('end', () => {
        const elapsed = Date.now() - startTime;
        console.log(`[copilot-proxy] #${reqId} completed (${elapsed}ms, streamed)`);
      });
    } else {
      // Non-streaming response
      const elapsed = Date.now() - startTime;
      console.log(`[copilot-proxy] #${reqId} completed (${elapsed}ms)`);
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
      res.end(result.body);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[copilot-proxy] #${reqId} Error (${elapsed}ms):`, error.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        message: error.message,
        type: 'proxy_error',
      },
    }));
  }
});

// === Startup ===

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('[copilot-proxy] GITHUB_TOKEN is required. Set it in your .env file.');
    process.exit(1);
  }

  // Validate token on startup
  try {
    await getValidToken();
    console.log('[copilot-proxy] Initial token exchange successful');
  } catch (error) {
    console.error(`[copilot-proxy] Failed initial token exchange: ${error.message}`);
    console.error('[copilot-proxy] Check that your GITHUB_TOKEN has Copilot access.');
    process.exit(1);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[copilot-proxy] Listening on port ${PORT}`);
    console.log(`[copilot-proxy] Proxying to ${COPILOT_CHAT_URL}`);
  });
}

main();
