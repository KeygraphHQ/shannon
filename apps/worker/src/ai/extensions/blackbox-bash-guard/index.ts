/**
 * Pi extension for black-box browser agents.
 *
 * These agents need pi's builtin bash tool because playwright-cli is a process,
 * but they do not need a general-purpose shell. Validate a deliberately small
 * POSIX-shell subset before execution so the command can contain exactly one
 * direct playwright-cli invocation and no shell program composition.
 */

import path from 'node:path';
import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import { isToolCallEventType } from '@earendil-works/pi-coding-agent';

const MAX_COMMAND_LENGTH = 32_768;
const BLOCKED_BARE_CHARACTERS = new Set([
  ';',
  '|',
  '&',
  '<',
  '>',
  '(',
  ')',
  '`',
  '$',
  '*',
  '?',
  '[',
  ']',
  '{',
  '}',
  '#',
  '!',
  '~',
]);

/** Model-safe page navigation and DOM interaction surface for black-box agents. */
export const BLACKBOX_PLAYWRIGHT_SUBCOMMANDS: readonly string[] = Object.freeze([
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
]);
const BLACKBOX_PLAYWRIGHT_SUBCOMMAND_SET = new Set(BLACKBOX_PLAYWRIGHT_SUBCOMMANDS);

const NON_PLAYWRIGHT_REASON =
  'Black-box browser bash permits one direct playwright-cli invocation. The bash command was not executed.';
const SHELL_SYNTAX_REASON =
  'Black-box browser bash does not permit shell composition or expansion. Run one direct playwright-cli command.';
const PRIVATE_PATH_REASON =
  'Black-box browser bash cannot pass authoritative .shannon/blackbox paths to playwright-cli.';
const UNSAFE_PLAYWRIGHT_REASON =
  'Black-box browser bash blocks playwright-cli commands that can execute host-side code or bypass private-path checks.';
const SESSION_REASON =
  'Black-box browser bash requires exactly one approved -s=<name> or --session=<name> selector before the playwright-cli subcommand.';

interface ParsedCommand {
  readonly arguments: readonly string[];
  readonly unsafeShellSyntax: boolean;
}

function parseDirectCommand(command: string): ParsedCommand {
  const arguments_: string[] = [];
  let current = '';
  let tokenStarted = false;
  let state: 'bare' | 'single' | 'double' = 'bare';
  let unsafeShellSyntax = false;

  const push = (): void => {
    if (!tokenStarted) return;
    arguments_.push(current);
    current = '';
    tokenStarted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? '';
    const code = character.charCodeAt(0);
    if (code === 0 || character === '\n' || character === '\r' || (code < 32 && character !== '\t')) {
      unsafeShellSyntax = true;
      continue;
    }

    if (state === 'single') {
      if (character === "'") {
        state = 'bare';
      } else {
        current += character;
      }
      tokenStarted = true;
      continue;
    }

    if (state === 'double') {
      if (character === '"') {
        state = 'bare';
        tokenStarted = true;
        continue;
      }
      if (character === '$' || character === '`') {
        unsafeShellSyntax = true;
        current += character;
        tokenStarted = true;
        continue;
      }
      if (character === '\\') {
        const next = command[index + 1];
        if (next === undefined) {
          unsafeShellSyntax = true;
          continue;
        }
        if (next === '$' || next === '`') unsafeShellSyntax = true;
        if (next === '$' || next === '`' || next === '"' || next === '\\') {
          current += next;
          index += 1;
        } else {
          current += `\\${next}`;
          index += 1;
        }
        tokenStarted = true;
        continue;
      }
      current += character;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(character)) {
      push();
      continue;
    }
    if (character === "'") {
      state = 'single';
      tokenStarted = true;
      continue;
    }
    if (character === '"') {
      state = 'double';
      tokenStarted = true;
      continue;
    }
    if (character === '\\') {
      const next = command[index + 1];
      if (next === undefined || next === '\n' || next === '\r') {
        unsafeShellSyntax = true;
        continue;
      }
      current += next;
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (BLOCKED_BARE_CHARACTERS.has(character)) unsafeShellSyntax = true;
    current += character;
    tokenStarted = true;
  }

  if (state !== 'bare') unsafeShellSyntax = true;
  push();
  return { arguments: arguments_, unsafeShellSyntax };
}

function decodedVariants(argument: string): string[] {
  const variants = new Set<string>();
  let current = argument.normalize('NFKC').replaceAll('\\', '/').toLowerCase();
  for (let pass = 0; pass < 3; pass += 1) {
    variants.add(current);
    variants.add(path.posix.normalize(current));
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded.normalize('NFKC').replaceAll('\\', '/').toLowerCase();
    } catch {
      break;
    }
  }
  variants.add(current);
  variants.add(path.posix.normalize(current));
  return [...variants];
}

function referencesPrivateBlackboxPath(argument: string): boolean {
  return decodedVariants(argument).some((candidate) => candidate.includes('.shannon/blackbox'));
}

function referencesExecutableUrlScheme(argument: string): boolean {
  return decodedVariants(argument).some((candidate) => /(?:^|[=,:("'\s])(?:file|javascript|data):/.test(candidate));
}

interface PlaywrightInvocation {
  readonly subcommand: string | null | undefined;
  readonly subcommandIndex: number;
}

function playwrightInvocation(arguments_: readonly string[]): PlaywrightInvocation {
  let index = 1;
  while (arguments_[index]?.startsWith('-s=') || arguments_[index]?.startsWith('--session=')) index += 1;
  const command = arguments_[index];
  if (command === undefined || ['--help', '-h', '--version', '-v'].includes(command)) {
    return { subcommand: undefined, subcommandIndex: index };
  }
  if (command.startsWith('-')) return { subcommand: null, subcommandIndex: index };
  return { subcommand: command, subcommandIndex: index };
}

function hasUnapprovedPostCommandOption(arguments_: readonly string[], subcommandIndex: number): boolean {
  return arguments_.slice(subcommandIndex + 1).some((argument) => /^--?[A-Za-z]/.test(argument));
}

/** Evaluate a model-authored bash command before pi invokes the shell. */
export function evaluateBlackboxBashCommand(command: unknown): ToolCallEventResult | undefined {
  if (typeof command !== 'string' || command.length === 0 || command.length > MAX_COMMAND_LENGTH) {
    return { block: true, reason: NON_PLAYWRIGHT_REASON };
  }
  const parsed = parseDirectCommand(command);
  if (parsed.unsafeShellSyntax) return { block: true, reason: SHELL_SYNTAX_REASON };
  if (parsed.arguments[0] !== 'playwright-cli') return { block: true, reason: NON_PLAYWRIGHT_REASON };
  const invocation = playwrightInvocation(parsed.arguments);
  const { subcommand } = invocation;
  // Fail closed: request/cookie/storage/state/file/route commands and executable
  // JS (`run-code`/`eval`) are intentionally absent from the model-safe surface.
  if (subcommand === null || (subcommand !== undefined && !BLACKBOX_PLAYWRIGHT_SUBCOMMAND_SET.has(subcommand))) {
    return { block: true, reason: UNSAFE_PLAYWRIGHT_REASON };
  }
  if (subcommand !== undefined && hasUnapprovedPostCommandOption(parsed.arguments, invocation.subcommandIndex)) {
    return { block: true, reason: UNSAFE_PLAYWRIGHT_REASON };
  }
  if (parsed.arguments.some(referencesPrivateBlackboxPath)) {
    return { block: true, reason: PRIVATE_PATH_REASON };
  }
  if (parsed.arguments.some(referencesExecutableUrlScheme)) {
    return { block: true, reason: UNSAFE_PLAYWRIGHT_REASON };
  }
  return undefined;
}

function sessionName(selector: string): string | null {
  if (selector.startsWith('-s=')) return selector.slice(3);
  if (selector.startsWith('--session=')) return selector.slice('--session='.length);
  return null;
}

function evaluateWithSessionSet(
  command: unknown,
  allowedSessions: ReadonlySet<string>,
): ToolCallEventResult | undefined {
  const staticResult = evaluateBlackboxBashCommand(command);
  if (staticResult) return staticResult;
  if (typeof command !== 'string') return { block: true, reason: SESSION_REASON };

  const parsed = parseDirectCommand(command);
  const invocation = playwrightInvocation(parsed.arguments);
  const selectors = parsed.arguments.slice(1, invocation.subcommandIndex);
  if (selectors.length !== 1) return { block: true, reason: SESSION_REASON };
  const selected = sessionName(selectors[0] ?? '');
  if (selected === null || selected.length === 0 || !allowedSessions.has(selected)) {
    return { block: true, reason: SESSION_REASON };
  }
  return undefined;
}

/** Evaluate against the exact live browser-session set supplied by the host. */
export function evaluateSessionBoundBlackboxBashCommand(
  command: unknown,
  allowedSessions: ReadonlySet<string> | readonly string[],
): ToolCallEventResult | undefined {
  return evaluateWithSessionSet(command, new Set(allowedSessions));
}

function registerGuard(pi: ExtensionAPI, evaluate: (command: unknown) => ToolCallEventResult | undefined): void {
  pi.on('tool_call', (event: ToolCallEvent): ToolCallEventResult | undefined => {
    if (!isToolCallEventType('bash', event)) return undefined;
    return evaluate(event.input.command);
  });
}

/** Build an inline pi extension bound to an immutable copy of the permitted sessions. */
export function createSessionBoundBlackboxBashGuardExtension(
  allowedSessions: readonly string[],
): (pi: ExtensionAPI) => void {
  const sessions = new Set(allowedSessions);
  return (pi: ExtensionAPI): void => registerGuard(pi, (command) => evaluateWithSessionSet(command, sessions));
}

export default function blackboxBashGuardExtension(pi: ExtensionAPI): void {
  registerGuard(pi, evaluateBlackboxBashCommand);
}
