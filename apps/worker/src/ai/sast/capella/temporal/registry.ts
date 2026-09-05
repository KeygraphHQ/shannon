// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import {
  capellaArchitecture,
  capellaCalibrate,
  capellaConfirm,
  capellaCritic,
  capellaDedupe,
  capellaExport,
  capellaPlan,
  capellaResearch,
  capellaReview,
  capellaThreatModel,
} from './activities.js';
import { CAPELLA_ACTIVITY_NAMES, type CapellaActivityRegistry } from './activity-types.js';

const registry = {
  capellaArchitecture,
  capellaThreatModel,
  capellaPlan,
  capellaResearch,
  capellaDedupe,
  capellaReview,
  capellaCritic,
  capellaConfirm,
  capellaCalibrate,
  capellaExport,
} satisfies CapellaActivityRegistry;

// The satisfies clause proves the shape at compile time; this runtime check catches
// the remaining drift risk, the name list and the object literal edited apart, and
// stops the worker at module load instead of registering a wrong surface.
const registeredNames = Object.keys(registry).sort();
const expectedNames = [...CAPELLA_ACTIVITY_NAMES].sort();
if (
  registeredNames.length !== expectedNames.length ||
  registeredNames.some((name, index) => name !== expectedNames[index])
) {
  throw new Error('Capella activity registry does not match its frozen ten-name contract');
}

/** Frozen production registry containing the ten Capella activity wrappers. */
export const capellaActivities: Readonly<CapellaActivityRegistry> = Object.freeze(registry);

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
  ? I
  : never;

/** Merge explicit activity registries and fail before worker startup on any collision. */
export function mergeActivityRegistries<const T extends readonly object[]>(
  ...registries: T
): Readonly<UnionToIntersection<T[number]>> {
  const merged: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const activityRegistry of registries) {
    for (const [name, implementation] of Object.entries(activityRegistry)) {
      if (Object.hasOwn(merged, name)) {
        throw new Error(`Duplicate Temporal activity registration: ${name}`);
      }
      merged[name] = implementation;
    }
  }
  return Object.freeze(merged) as Readonly<UnionToIntersection<T[number]>>;
}
