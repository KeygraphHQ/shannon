/**
 * The OrcaRouter model selector.
 *
 * A user who picks OrcaRouter must choose from the models their own key can actually
 * call, so the choices here are built from the live catalogue and nothing else. There is
 * no free-text model prompt on this path: a hand-typed id would be a guess about a
 * workspace we can already ask about.
 *
 * The list is recomputed whenever the thing that decides compatibility changes — the
 * provider, or a non-text modality an entry point has started uploading — and a selection
 * that is no longer in the new list is cleared rather than carried along, because a model
 * the entry point cannot call fails at the wire, not at the prompt.
 */

import { type CapabilityFilter, filterCatalog, type OrcaCatalogModel, type OrcaCatalogResult } from './catalog.js';
import { ORCAROUTER_PROVIDER_ID } from './provider-id.js';

/** One entry in a model selector. */
export interface OrcaModelChoice {
  /** The full `provider:model-id` spec a run is configured with. */
  readonly value: string;
  readonly label: string;
  /** Context window and modality summary, shown alongside the label. */
  readonly hint: string;
  readonly model: OrcaCatalogModel;
}

/** Render the one-line hint under a model's name. */
function describeModel(model: OrcaCatalogModel): string {
  const modalities = model.inputModalities.filter((modality) => modality !== 'text');
  const parts = [`${Math.round(model.contextWindow / 1024)}K context`];
  if (modalities.length > 0) parts.push(`accepts ${modalities.join(', ')}`);
  if (model.reasoning) parts.push('reasoning');
  return parts.join(' · ');
}

/**
 * Build the selector options for a capability.
 *
 * `models` is the catalogue as loaded; the capability filter is applied here so the
 * caller cannot accidentally offer an option its entry point cannot use.
 */
export function buildModelChoices(models: readonly OrcaCatalogModel[], filter: CapabilityFilter): OrcaModelChoice[] {
  return filterCatalog(models, filter).map((model) => ({
    value: `${ORCAROUTER_PROVIDER_ID}:${model.id}`,
    label: model.name,
    hint: describeModel(model),
    model,
  }));
}

export interface SelectionReconciliation {
  /** The selection to keep, or undefined when it must be cleared. */
  readonly selected: string | undefined;
  /** True when a previous selection was dropped because it is no longer compatible. */
  readonly cleared: boolean;
}

/**
 * Re-check a previous selection against a freshly computed option list.
 *
 * Called when the provider changes or when an entry point starts uploading a modality it
 * did not before. A value that is no longer offered is cleared — silently keeping it
 * would leave a run pointed at a model the entry point cannot call.
 */
export function reconcileSelection(
  previous: string | undefined,
  choices: readonly OrcaModelChoice[],
): SelectionReconciliation {
  if (!previous) return { selected: undefined, cleared: false };
  if (choices.some((choice) => choice.value === previous)) return { selected: previous, cleared: false };
  return { selected: undefined, cleared: true };
}

/** A note describing where the list came from, so a degraded catalogue is never silent. */
export function describeCatalogSource(result: OrcaCatalogResult): string | undefined {
  if (result.source === 'live') return undefined;

  switch (result.reason) {
    case 'network':
      return 'Could not reach api.orcarouter.ai, so this is a short verified list rather than your full catalogue. Re-run to refresh.';
    case 'timeout':
      return 'api.orcarouter.ai did not answer in time, so this is a short verified list rather than your full catalogue. Re-run to refresh.';
    case 'http':
      return 'OrcaRouter refused the model list request, so this is a short verified list. Check your key and re-run.';
    case 'oversized':
      return 'The model list response was larger than this client accepts, so this is a short verified list.';
    default:
      return 'The model list response could not be read, so this is a short verified list rather than your full catalogue.';
  }
}
