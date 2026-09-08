import assert from 'node:assert/strict';
import test from 'node:test';

import * as guardModule from '../dist/ai/extensions/blackbox-bash-guard/index.js';

const { default: guardExtension, evaluateBlackboxBashCommand } = guardModule;

const SAFE_SUBCOMMANDS = [
  'goto',
  'type',
  'click',
  'dblclick',
  'fill',
  'drag',
  'hover',
  'select',
  'check',
  'uncheck',
  'snapshot',
  'dialog-accept',
  'dialog-dismiss',
  'resize',
  'go-back',
  'go-forward',
  'reload',
  'press',
  'keydown',
  'keyup',
  'mousemove',
  'mousedown',
  'mouseup',
  'mousewheel',
  'tab-list',
  'tab-new',
  'tab-close',
  'tab-select',
];

function blocked(command) {
  const result = evaluateBlackboxBashCommand(command);
  assert.equal(result?.block, true, command);
  assert.match(result.reason, /playwright-cli|shell|private/i, command);
}

function blockedSessionCommand(command, allowedSessions) {
  const result = guardModule.evaluateSessionBoundBlackboxBashCommand(command, allowedSessions);
  assert.equal(result?.block, true, command);
  assert.match(result.reason, /session|playwright-cli|shell|private/i, command);
}

test('allows one ordinary direct playwright-cli invocation', () => {
  assert.equal(evaluateBlackboxBashCommand('playwright-cli goto https://example.test/account'), undefined);
  assert.equal(evaluateBlackboxBashCommand('  playwright-cli -s=attacker goto "https://example.test/search?q=a&sort=asc"  '), undefined);
  assert.equal(evaluateBlackboxBashCommand('playwright-cli --session=victim snapshot'), undefined);
  assert.equal(evaluateBlackboxBashCommand("playwright-cli click 'button[data-id=save]'"), undefined);
  assert.equal(evaluateBlackboxBashCommand('playwright-cli snapshot'), undefined);
});

test('the black-box browser allowlist contains only page navigation and DOM interaction commands', () => {
  assert.deepEqual(guardModule.BLACKBOX_PLAYWRIGHT_SUBCOMMANDS, SAFE_SUBCOMMANDS);
  for (const subcommand of SAFE_SUBCOMMANDS) {
    assert.equal(evaluateBlackboxBashCommand(`playwright-cli -s=recon ${subcommand}`), undefined, subcommand);
  }
});

test('blocks request, cookie, storage, state, file, route, and process-management commands', () => {
  for (const command of [
    'open https://example.test',
    'close',
    'request https://example.test/api',
    'network',
    'console',
    'cookie-list',
    'cookie-get session',
    'cookie-set session secret',
    'cookie-delete session',
    'cookie-clear',
    'localstorage-list',
    'localstorage-get token',
    'localstorage-set token secret',
    'localstorage-delete token',
    'localstorage-clear',
    'sessionstorage-list',
    'sessionstorage-get token',
    'sessionstorage-set token secret',
    'sessionstorage-delete token',
    'sessionstorage-clear',
    'state-load /tmp/state.json',
    'state-save /tmp/state.json',
    'upload /tmp/input.txt',
    'screenshot',
    'pdf',
    "route '**/api/*'",
    'route-list',
    'unroute',
    'tracing-start',
    'tracing-stop',
    'video-start',
    'video-stop',
    'delete-data',
    'list',
    'close-all',
    'kill-all',
    'install',
    'install-browser',
    'show',
    'devtools-start',
    'config-print',
    'tray',
    'future-unknown-command',
  ]) blocked(`playwright-cli -s=recon ${command}`);
});

test('session selection is pre-command only and all post-command options fail closed', () => {
  for (const command of [
    'playwright-cli snapshot -s=other',
    'playwright-cli snapshot --session=other',
    'playwright-cli snapshot -s other',
    'playwright-cli snapshot --session other',
    'playwright-cli snapshot --filename=/tmp/snapshot.md',
    'playwright-cli goto --config=/tmp/playwright.json https://example.test',
    'playwright-cli goto --profile=/tmp/profile https://example.test',
    'playwright-cli goto --persistent https://example.test',
    'playwright-cli goto --extension=/tmp/extension https://example.test',
    'playwright-cli open --config /tmp/playwright.json https://example.test',
    'playwright-cli open --profile /tmp/profile https://example.test',
    'playwright-cli open --persistent https://example.test',
    'playwright-cli open --extension /tmp/extension https://example.test',
  ]) blocked(command);

  assert.equal(evaluateBlackboxBashCommand('playwright-cli -s=owner snapshot'), undefined);
  assert.equal(evaluateBlackboxBashCommand('playwright-cli --session=attacker goto https://example.test'), undefined);
});

test('session-bound evaluation requires exactly one approved pre-command selector', () => {
  assert.equal(typeof guardModule.evaluateSessionBoundBlackboxBashCommand, 'function');
  const allowed = ['victim', 'attacker'];

  assert.equal(guardModule.evaluateSessionBoundBlackboxBashCommand('playwright-cli -s=victim snapshot', allowed), undefined);
  assert.equal(
    guardModule.evaluateSessionBoundBlackboxBashCommand(
      'playwright-cli --session=attacker goto https://example.test',
      allowed,
    ),
    undefined,
  );
  for (const command of [
    'playwright-cli snapshot',
    'playwright-cli -s=other snapshot',
    'playwright-cli -s=victim -s=attacker snapshot',
    'playwright-cli -s=victim --session=victim snapshot',
    'playwright-cli snapshot -s=victim',
    'playwright-cli snapshot --session=attacker',
    'playwright-cli -s victim snapshot',
    'playwright-cli --session attacker snapshot',
  ]) {
    blockedSessionCommand(command, allowed);
  }
});

test('session-bound guard factory registers an inline Pi extension with an immutable session set', () => {
  assert.equal(typeof guardModule.createSessionBoundBlackboxBashGuardExtension, 'function');
  const allowed = ['victim'];
  const extension = guardModule.createSessionBoundBlackboxBashGuardExtension(allowed);
  allowed[0] = 'attacker';

  let handler;
  extension({ on(_event, callback) { handler = callback; } });
  assert.equal(
    handler({ type: 'tool_call', toolName: 'bash', toolCallId: 'good', input: { command: 'playwright-cli -s=victim snapshot' } }),
    undefined,
  );
  assert.equal(
    handler({ type: 'tool_call', toolName: 'bash', toolCallId: 'bad', input: { command: 'playwright-cli -s=attacker snapshot' } })?.block,
    true,
  );
});

test('blocks every non-playwright executable and executable indirection', () => {
  for (const command of [
    'cat .shannon/blackbox/blackboard.json',
    'node -e "process.stdout.write(\'secret\')"',
    'python -c "print(1)"',
    'python3 -c "print(1)"',
    'bash -c "playwright-cli open https://example.test"',
    'env DEBUG=1 playwright-cli open https://example.test',
    '/usr/local/bin/playwright-cli open https://example.test',
    'playwright-cli-wrapper open https://example.test',
  ]) blocked(command);
});

test('blocks playwright run-code because its Node VM can escape the path guard', () => {
  for (const command of [
    `playwright-cli run-code 'async page => page.constructor.constructor("return process")().cwd()'`,
    `playwright-cli -s=attacker run-code 'async page => page.goto("file:///target/.shannon/" + "blackbox/raw/x")'`,
    `playwright-cli -s attacker run-code 'async page => page.title()'`,
    `playwright-cli --no-help run-code 'async page => page.title()'`,
    `playwright-cli eval '() => { location.href = "file:///target/.shannon/" + "blackbox/raw/x"; }'`,
  ]) blocked(command);

  assert.equal(evaluateBlackboxBashCommand('playwright-cli type run-code'), undefined);
});

test('blocks local and executable URL schemes that can route browser code around argument checks', () => {
  for (const command of [
    'playwright-cli open file:///etc/hosts',
    `playwright-cli goto 'javascript:location.href="file:///target/"+".shannon/"+"blackbox/raw/x"'`,
    `playwright-cli tab-new 'data:text/html,<script>location="file:///target/"+".shannon/"+"blackbox/raw/x"</script>'`,
  ]) blocked(command);
});

test('blocks shell composition, substitution, expansion, and redirection', () => {
  for (const command of [
    'playwright-cli snapshot | cat',
    'playwright-cli snapshot && cat /etc/passwd',
    'playwright-cli snapshot; node exploit.js',
    'playwright-cli open $(cat .shannon/blackbox/blackboard.json)',
    'playwright-cli open `python -c "print(1)"`',
    'playwright-cli open "$TARGET_URL"',
    'playwright-cli open ${TARGET_URL}',
    'playwright-cli screenshot > /tmp/result',
    'playwright-cli open <(node exploit.js)',
    'playwright-cli open https://example.test/*',
    'playwright-cli open https://example.test/{a,b}',
    'playwright-cli snapshot\ncat /etc/passwd',
  ]) blocked(command);
});

test('blocks authoritative black-box paths in literal, normalized, and encoded arguments', () => {
  for (const command of [
    'playwright-cli open file:///target/.shannon/blackbox/raw/request.txt',
    'playwright-cli state-load /target/.shannon/blackbox/identities/victim/storage-state.json',
    'playwright-cli open /target/.shannon/blackbox/blackboard.json',
    'playwright-cli open /target/.shannon/blackbox/verification-runs/run-1/result.json',
    'playwright-cli open /target/.shannon/./blackbox/raw/request.txt',
    'playwright-cli open file:///target/%2Eshannon%2Fblackbox%2Fraw%2Frequest.txt',
    'playwright-cli open file:///target/%252Eshannon%252Fblackbox%252Fraw%252Frequest.txt',
    'playwright-cli open file:///target/%25252Eshannon%25252Fblackbox%25252Fraw%25252Frequest.txt',
    'playwright-cli open "file:///target/.shannon\\blackbox\\raw\\request.txt"',
  ]) blocked(command);
});

test('extension blocks bash before execution and ignores non-bash tools', () => {
  let handler;
  guardExtension({
    on(event, callback) {
      assert.equal(event, 'tool_call');
      handler = callback;
    },
  });
  assert.equal(typeof handler, 'function');
  assert.equal(
    handler({ type: 'tool_call', toolName: 'bash', toolCallId: 'bad', input: { command: 'cat /etc/passwd' } })?.block,
    true,
  );
  assert.equal(
    handler({ type: 'tool_call', toolName: 'bash', toolCallId: 'good', input: { command: 'playwright-cli snapshot' } }),
    undefined,
  );
  assert.equal(
    handler({ type: 'tool_call', toolName: 'read', toolCallId: 'read', input: { path: '/tmp/x' } }),
    undefined,
  );
});
