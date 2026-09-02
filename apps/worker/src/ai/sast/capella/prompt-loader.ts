// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import Handlebars from 'handlebars';
import { CapellaRetryableError, ConfigurationError } from './errors.js';
import { CAPELLA_PROMPT_CONTEXT_KEYS } from './prompt-context.js';

/** Transient I/O only; a missing or malformed asset is configuration, not retryable. */
const RETRYABLE_PROMPT_IO_CODES = new Set(['EAGAIN', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ENOMEM']);

export const CAPELLA_PROMPT_IDS = [
  'sast.capella.architecture',
  'sast.capella.threat_model',
  'sast.capella.plan',
  'sast.capella.triage',
  'sast.capella.research',
  'sast.capella.dedupe',
  'sast.capella.review',
  'sast.capella.critic',
  'sast.capella.confirm',
  'sast.capella.calibrate',
] as const;

export type CapellaPromptId = (typeof CAPELLA_PROMPT_IDS)[number];

export interface RenderCapellaPromptOptions {
  readonly pipelineTestingMode?: boolean;
}

export interface CapellaPromptLoader {
  render(
    promptId: CapellaPromptId,
    context?: Readonly<Record<string, unknown>>,
    options?: RenderCapellaPromptOptions,
  ): string;
}

/** Create an isolated loader that registers only Capella-owned partials. */
export function createCapellaPromptLoader(promptRoot: string): CapellaPromptLoader {
  const handlebars = Handlebars.create();
  const partialsDir = join(promptRoot, 'partials');
  const cache = new Map<string, Handlebars.TemplateDelegate>();

  let partialFiles: string[];
  try {
    partialFiles = readdirSync(partialsDir)
      .filter((file) => /^capella-[A-Za-z0-9._-]+\.hbs$/.test(file))
      .sort();
  } catch (error) {
    throw promptReadError(error, 'PROMPT_PARTIALS_UNAVAILABLE');
  }

  for (const file of partialFiles) {
    const name = basename(file, '.hbs');
    handlebars.registerPartial(name, readPromptFile(join(partialsDir, file)));
  }

  return {
    render(
      promptId: CapellaPromptId,
      context: Readonly<Record<string, unknown>> = {},
      options: RenderCapellaPromptOptions = {},
    ): string {
      if (!(CAPELLA_PROMPT_IDS as readonly string[]).includes(promptId)) {
        throw new ConfigurationError('Unknown Capella prompt id');
      }
      for (const requiredKey of CAPELLA_PROMPT_CONTEXT_KEYS[promptId]) {
        if (!(requiredKey in context)) {
          throw new ConfigurationError(`Capella prompt context is missing ${requiredKey}`);
        }
      }
      const relative = promptId.replace(/\./g, '/');
      const suffix = options.pipelineTestingMode === true ? '.test.hbs' : '.prompt.hbs';
      const filePath = join(promptRoot, `${relative}${suffix}`);
      let template = cache.get(filePath);
      if (!template) {
        try {
          template = handlebars.compile(readPromptFile(filePath), { noEscape: true });
        } catch (error) {
          if (error instanceof ConfigurationError || error instanceof CapellaRetryableError) throw error;
          throw new ConfigurationError('Required Capella prompt asset is invalid', 'PROMPT_COMPILE_FAILED');
        }
        cache.set(filePath, template);
      }
      try {
        return template(context);
      } catch {
        throw new ConfigurationError('Required Capella prompt asset is invalid', 'PROMPT_RENDER_FAILED');
      }
    },
  };
}

function readPromptFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    throw promptReadError(error, 'PROMPT_ASSET_UNAVAILABLE');
  }
}

function promptReadError(error: unknown, unavailableCode: string): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && RETRYABLE_PROMPT_IO_CODES.has(code)) {
    return new CapellaRetryableError('Capella prompt assets could not be read', 'PROMPT_IO');
  }
  return new ConfigurationError('Required Capella prompt asset is unavailable', unavailableCode);
}
