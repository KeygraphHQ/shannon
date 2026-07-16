// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { type Static, type TSchema, type TSchemaOptions, Type } from 'typebox';
import { Value } from 'typebox/value';

/**
 * String-literal enum schema whose `Static` resolves to the exact value union.
 *
 * Mapping `Type.Literal` over an array loses tuple typing (`Static` widens to
 * `never`), so enums are authored as a JSON-Schema `{ type: 'string', enum }`
 * via `Type.Unsafe` — the same shape the previous Zod `z.enum` schemas produced,
 * and validated at runtime by pi's TypeBox checker.
 */
export function stringEnum<const T extends readonly string[]>(values: T, options: TSchemaOptions = {}) {
  return Type.Unsafe<T[number]>({ ...options, type: 'string', enum: [...values] });
}

/**
 * Strips keys not declared on `schema` before storage, matching the previous
 * Zod bridge's `safeParse()` behavior (Zod objects silently strip unknown
 * keys by default; TypeBox schemas accept them unless explicitly cleaned).
 */
export function cleanInput<T extends TSchema>(schema: T, input: Static<T>): Static<T> {
  return Value.Clean(schema, structuredClone(input)) as Static<T>;
}
