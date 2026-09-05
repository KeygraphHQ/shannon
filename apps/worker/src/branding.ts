// Copyright (C) 2025 Keygraph, Inc.

/**
 * Centralized brand strings for report deliverables.
 *
 * Kept in two parts because the two renderers join them differently: the Typst
 * template splits its `brand` input on a pipe to set the cover's two lines
 * (`report.typ:212`), while a human-read line takes an em dash.
 */

export const PRODUCT_NAME = 'Shannon';
export const PRODUCT_DESCRIPTOR = 'AI Pentester by Keygraph';

/** Cover wordmark for the Typst template, which parses the pipe. */
export const TYPST_BRAND = `${PRODUCT_NAME} | ${PRODUCT_DESCRIPTOR}`;

/** Attribution line for prose surfaces. */
export const BRAND_LOCKUP = `${PRODUCT_NAME} — ${PRODUCT_DESCRIPTOR}`;
