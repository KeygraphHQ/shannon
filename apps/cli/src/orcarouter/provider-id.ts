/**
 * The OrcaRouter provider id and display name.
 *
 * Its own module because the CLI's selector, credential, and setup modules all need the
 * id without pulling in the worker-only provider registration, which imports the harness.
 */

/** Provider id used in `SHANNON_AI_MODEL`, e.g. `orcarouter:openai/gpt-5.5`. */
export const ORCAROUTER_PROVIDER_ID = 'orcarouter';

/** Label shown in prompts and status output. */
export const ORCAROUTER_PROVIDER_NAME = 'OrcaRouter';
