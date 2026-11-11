#!/usr/bin/env node
/**
 * Shannon MCP server.
 *
 * Exposes Shannon's CLI as Model Context Protocol tools over stdio, so a coding
 * agent can start, monitor, and read pentests as typed tool calls instead of
 * raw shell commands. It speaks JSON-RPC 2.0 with newline-delimited messages,
 * the MCP stdio transport, and has no npm dependencies.
 *
 * The same safety rules as the skill apply. shannon_start and
 * shannon_validate_auth refuse to run unless the caller passes authorized=true
 * and non_production=true, which the agent may only set after the human has
 * confirmed both in their own words. The destructive `reset` command and the
 * experimental php2shell probe are not exposed at all.
 */

import { spawn } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SERVER_NAME = "shannon";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";
const REPORT_FILE = "Security-Assessment-Report.md";
const WORKFLOW_LOG_FILE = "workflow.log";
const LOG_TAIL_BYTES = 512 * 1024;
const LOG_LINE_MAX_CHARS = 2000;

// === Shannon CLI invocation ===

// The base command. Override with SHANNON_CLI (space-separated) for local
// builds or pinned versions; defaults to the published npx package.
function cliCommand() {
  const override = (process.env.SHANNON_CLI || "").trim();
  if (override) {
    const parts = override.split(/\s+/);
    return { cmd: parts[0], base: parts.slice(1) };
  }
  return { cmd: "npx", base: ["-y", "@keygraph/shannon@latest"] };
}

// Environment overlay for a run, from tool params. Provider credentials still
// come from the user's environment or Shannon config; these only select the
// model and the Pi-subscription auth path.
function runEnv({ model, use_pi_auth } = {}) {
  const extra = {};
  if (typeof model === "string" && model.trim()) {
    extra.SHANNON_AI_MODEL = model.trim();
  }
  if (use_pi_auth === true) {
    extra.SHANNON_USE_PI_AUTH = "1";
  }
  return extra;
}

// Run the CLI and resolve with its exit code and captured output. Never throws.
function runCli(args, { timeoutMs = 120000, extraEnv = {} } = {}) {
  return new Promise((resolve) => {
    const { cmd, base } = cliCommand();
    let child;
    try {
      child = spawn(cmd, [...base, ...args], {
        env: { ...process.env, ...extraEnv },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String(e?.message || e), timedOut: false });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr || String(e?.message || e), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

// Clean CLI output into readable lines: drop ANSI escapes, turn the spinner's
// carriage-return frames into separate lines, strip leading spinner and box
// glyphs, and collapse consecutive duplicate lines so a progress animation does
// not flood the tool result.
function cleanLines(text) {
  const normalized = (text || "")
    // Drop SGR color codes outright.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*m/g, "")
    // Treat cursor-move / erase sequences as frame boundaries so a spinner's
    // overwritten frames become separate lines that can be de-duplicated.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "\n")
    .replace(/\r/g, "\n")
    // When output is piped the CLI drops the cursor resets, so consecutive
    // spinner frames are separated only by the spinner glyph. Break before each
    // one so the de-duplication below collapses the animation.
    .replace(/([◆-◗])/g, "\n$1");
  const lines = normalized
    .split("\n")
    .map((l) => l.replace(/^[\s─-◿]+/, "").replace(/\s+$/, ""));
  // A spinner animates by cycling its trailing dots, so frames of one message
  // differ only there. Compare without them and keep the first frame.
  const out = [];
  let previousKey = null;
  for (const line of lines) {
    if (!line) continue;
    const key = line.replace(/\.+$/, "");
    if (key === previousKey) continue;
    previousKey = key;
    out.push(line);
  }
  return out;
}

function combinedOutput(result) {
  const out = cleanLines(result.stdout);
  const err = cleanLines(result.stderr);
  const parts = [];
  if (out.length > 0) parts.push(out.join("\n"));
  if (err.length > 0) parts.push(err.join("\n"));
  if (result.timedOut) parts.push("(command timed out and was stopped)");
  return parts.join("\n\n") || "(no output)";
}

// A CLI run as a tool result. The CLI exits non-zero when a command fails, so
// the result is flagged as an error instead of leaving the caller to infer the
// failure from the text.
function cliResult(result) {
  return { text: combinedOutput(result), isError: result.code !== 0 || result.timedOut };
}

// === Workspace files ===

// A workspace name becomes a path segment, so it must not be able to leave the
// workspaces directory.
function requireWorkspace(args) {
  const workspace = requireString(args, "workspace");
  if (workspace === "." || workspace === ".." || /[\\/]/.test(workspace)) {
    throw new Error("workspace must be a workspace name, not a path");
  }
  return workspace;
}

function workspaceDir(workspace) {
  return join(homedir(), ".shannon", "workspaces", workspace);
}

function workspaceReportPath(workspace) {
  return join(workspaceDir(workspace), REPORT_FILE);
}

// The workflow log sits under the workspace's hidden internals directory;
// workspaces from older releases keep it at the workspace root.
function workflowLogPaths(workspace) {
  const dir = workspaceDir(workspace);
  return [join(dir, ".shannon", WORKFLOW_LOG_FILE), join(dir, WORKFLOW_LOG_FILE)];
}

// Read the last lines of a file without loading all of it: a scan log runs to
// megabytes. Returns null when the file cannot be read.
async function readTailLines(path, count) {
  let handle;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n");
    // A read that starts mid-file starts mid-line; drop that partial line.
    if (length < size) lines.shift();
    return lines
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l)
      .slice(-count)
      .map((l) => (l.length > LOG_LINE_MAX_CHARS ? `${l.slice(0, LOG_LINE_MAX_CHARS)} [line truncated]` : l));
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

// === Tool definitions ===

const TOOLS = [
  {
    name: "shannon_validate_model",
    description:
      "Validate the AI model and provider credential before a full scan. Runs Shannon's preflight only (credential and model resolution, plus the cyber-access check for gated providers) and stops. Fast, no pentest. Use this to confirm a setup works.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL. For a host-local app use http://host.docker.internal:<port>, not localhost." },
        repo: { type: "string", description: "Absolute path to the target's source repository." },
        model: { type: "string", description: "Optional SHANNON_AI_MODEL, e.g. xai:grok-4.7. Defaults to the user's configuration." },
        use_pi_auth: { type: "boolean", description: "Set true to reuse a Pi subscription login (SHANNON_USE_PI_AUTH=1) instead of an API key." },
      },
      required: ["url", "repo"],
    },
  },
  {
    name: "shannon_validate_auth",
    description:
      "Validate the target app's LOGIN only, then stop. No pentest, no report; takes about a minute. Run this before a full authenticated scan to confirm the config's authentication block signs in correctly. Needs a fresh workspace and a config whose authentication block has the login URL, test credentials, and a success condition. REFUSED unless authorized=true and non_production=true, the same confirmation as shannon_start, because it signs into the target with real credentials.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL. For a host-local app use http://host.docker.internal:<port>, not localhost." },
        repo: { type: "string", description: "Absolute path to the target's source repository." },
        workspace: { type: "string", description: "A fresh workspace name for this check, e.g. <app>-auth-check." },
        config: { type: "string", description: "Absolute path to the YAML config whose authentication block defines the login." },
        model: { type: "string", description: "Optional SHANNON_AI_MODEL, e.g. xai:grok-4.7. Defaults to the user's configuration." },
        use_pi_auth: { type: "boolean", description: "Set true to reuse a Pi subscription login (SHANNON_USE_PI_AUTH=1) instead of an API key." },
        authorized: { type: "boolean", description: "Must be true: the human confirmed they own or are authorized to test the target." },
        non_production: { type: "boolean", description: "Must be true: the human confirmed the target is not production." },
      },
      required: ["url", "repo", "workspace", "config", "authorized", "non_production"],
    },
  },
  {
    name: "shannon_start",
    description:
      "Start a pentest scan. Non-blocking: returns once the worker is launched. REFUSED unless authorized=true and non_production=true, which you may only set after the human has confirmed, in their own words, that they own or are authorized to test the target and that it is not production. A full scan runs about 1 to 1.5 hours; monitor with shannon_status.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL. For a host-local app use http://host.docker.internal:<port>, not localhost." },
        repo: { type: "string", description: "Absolute path to the target's source repository (mounted read-only)." },
        workspace: { type: "string", description: "Workspace name, e.g. the app and date. Used to monitor, resume, and read the report." },
        config: { type: "string", description: "Optional absolute path to a YAML config file for authenticated testing, rules of engagement, or report filters." },
        model: { type: "string", description: "Optional SHANNON_AI_MODEL, e.g. xai:grok-4.7. Defaults to the user's configuration." },
        use_pi_auth: { type: "boolean", description: "Set true to reuse a Pi subscription login (SHANNON_USE_PI_AUTH=1) instead of an API key." },
        authorized: { type: "boolean", description: "Must be true: the human confirmed they own or are authorized to test the target." },
        non_production: { type: "boolean", description: "Must be true: the human confirmed the target is not production." },
      },
      required: ["url", "repo", "workspace", "authorized", "non_production"],
    },
  },
  {
    name: "shannon_status",
    description:
      "Get a running or finished scan's status as JSON: the top-level status (running, completed, partial, failed, cancelled), elapsedMs, a phases array of per-agent progress, and partialReasons when partial. Call this to answer 'how is the scan going?' mid-run.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "The scan's workspace name." },
      },
      required: ["workspace"],
    },
  },
  {
    name: "shannon_logs",
    description:
      "Return recent log lines from a scan without blocking. Useful for a quick look at what the current phase is doing.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "The scan's workspace name." },
        lines: { type: "number", description: "How many trailing lines to return (default 50)." },
      },
      required: ["workspace"],
    },
  },
  {
    name: "shannon_scans",
    description: "List every workspace with its state and the path of each finished report, as JSON.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "shannon_stop",
    description:
      "Stop a running scan. Only call this when the human has asked to stop. Resuming later re-runs shannon_start with the same workspace and the same model.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "The scan's workspace name." },
      },
      required: ["workspace"],
    },
  },
  {
    name: "shannon_read_report",
    description:
      "Read a finished scan's Markdown report. Shannon reports only what it exploited; an empty report means nothing in its five classes was exploited, not that the app is secure. Every finding needs human verification before anyone acts on it.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "The scan's workspace name." },
      },
      required: ["workspace"],
    },
  },
];

// === Tool handlers ===

function requireString(args, key) {
  const v = args?.[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Missing required string parameter: ${key}`);
  }
  return v.trim();
}

async function callTool(name, args) {
  args = args || {};
  switch (name) {
    case "shannon_validate_model": {
      const url = requireString(args, "url");
      const repo = requireString(args, "repo");
      const result = await runCli(
        ["start", "-u", url, "-r", repo, "--validate-model"],
        { timeoutMs: 300000, extraEnv: runEnv(args) },
      );
      return cliResult(result);
    }

    case "shannon_validate_auth": {
      if (args.authorized !== true || args.non_production !== true) {
        return {
          text:
            "Refused. shannon_validate_auth requires authorized=true and non_production=true. Confirm with the human, in their own words, that they own or are authorized to test the target and that it is not production, then set both flags.",
          isError: true,
        };
      }
      const url = requireString(args, "url");
      const repo = requireString(args, "repo");
      const workspace = requireString(args, "workspace");
      const config = requireString(args, "config");
      const result = await runCli(
        ["start", "-u", url, "-r", repo, "-w", workspace, "-c", config, "--validate-auth"],
        { timeoutMs: 600000, extraEnv: runEnv(args) },
      );
      return cliResult(result);
    }

    case "shannon_start": {
      if (args.authorized !== true || args.non_production !== true) {
        return {
          text:
            "Refused. shannon_start requires authorized=true and non_production=true. Confirm with the human, in their own words, that they own or are authorized to test the target and that it is not production, then set both flags.",
          isError: true,
        };
      }
      const url = requireString(args, "url");
      const repo = requireString(args, "repo");
      const workspace = requireString(args, "workspace");
      const cliArgs = ["start", "-u", url, "-r", repo, "-w", workspace];
      if (typeof args.config === "string" && args.config.trim()) {
        cliArgs.push("-c", args.config.trim());
      }
      const result = await runCli(cliArgs, { timeoutMs: 600000, extraEnv: runEnv(args) });
      return cliResult(result);
    }

    case "shannon_status": {
      const workspace = requireString(args, "workspace");
      const result = await runCli(["status", workspace, "--json"], { timeoutMs: 60000 });
      return cliResult(result);
    }

    case "shannon_logs": {
      const workspace = requireWorkspace(args);
      const lines = Number.isFinite(args.lines) && args.lines > 0 ? Math.floor(args.lines) : 50;
      // Read the log file itself: the CLI's `logs` output is cut short when it
      // is piped, which would return the start of a long log instead of its end.
      for (const path of workflowLogPaths(workspace)) {
        const tail = await readTailLines(path, lines);
        if (tail && tail.length > 0) return tail.join("\n");
      }
      // No log under ~/.shannon (a source-build install keeps workspaces
      // elsewhere), so ask the CLI. It follows a running scan, hence the timeout.
      const result = await runCli(["logs", workspace], { timeoutMs: 6000 });
      const fromCli = cleanLines(result.stdout).slice(-lines).join("\n");
      return fromCli || { text: combinedOutput(result), isError: true };
    }

    case "shannon_scans": {
      const result = await runCli(["scans", "--json"], { timeoutMs: 60000 });
      return cliResult(result);
    }

    case "shannon_stop": {
      const workspace = requireString(args, "workspace");
      const result = await runCli(["stop", workspace, "--yes"], { timeoutMs: 60000 });
      return cliResult(result);
    }

    case "shannon_read_report": {
      const workspace = requireWorkspace(args);
      const path = workspaceReportPath(workspace);
      try {
        const md = await readFile(path, "utf8");
        const capped = md.length > 120000 ? `${md.slice(0, 120000)}\n\n[report truncated]` : md;
        return capped;
      } catch {
        return {
          text: `No report found at ${path}. The scan may still be running or may have failed; check shannon_status. In a source-build install the path is ./workspaces/<workspace>/${REPORT_FILE}.`,
          isError: true,
        };
      }
    }

    default:
      return { text: `Unknown tool: ${name}`, isError: true };
  }
}

// === JSON-RPC over stdio ===

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function toContent(value) {
  // A handler returns either a plain string, or { text, isError }.
  if (typeof value === "string") {
    return { content: [{ type: "text", text: value }] };
  }
  return { content: [{ type: "text", text: value.text }], isError: value.isError === true };
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      sendResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;

    case "notifications/initialized":
    case "notifications/cancelled":
      return; // notifications: no response

    case "ping":
      if (!isNotification) sendResult(id, {});
      return;

    case "tools/list":
      sendResult(id, { tools: TOOLS });
      return;

    case "tools/call": {
      const toolName = params?.name;
      const known = TOOLS.some((t) => t.name === toolName);
      if (!known) {
        sendError(id, -32602, `Unknown tool: ${toolName}`);
        return;
      }
      try {
        const value = await callTool(toolName, params?.arguments);
        sendResult(id, toContent(value));
      } catch (e) {
        sendResult(id, toContent({ text: String(e?.message || e), isError: true }));
      }
      return;
    }

    default:
      if (!isNotification) sendError(id, -32601, `Method not found: ${method}`);
      return;
  }
}

function main() {
  let buffer = "";
  let stdinEnded = false;
  let pending = 0;

  const maybeExit = () => {
    if (stdinEnded && pending === 0) process.exit(0);
  };

  const dispatch = (msg) => {
    pending += 1;
    Promise.resolve()
      .then(() => handleMessage(msg))
      .catch(() => {})
      .finally(() => {
        pending -= 1;
        maybeExit();
      });
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          // Ignore unparseable lines rather than crash the transport.
          index = buffer.indexOf("\n");
          continue;
        }
        dispatch(msg);
      }
      index = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    stdinEnded = true;
    maybeExit();
  });
}

main();
