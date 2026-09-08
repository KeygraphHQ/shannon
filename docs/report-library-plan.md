# Local report library implementation scope

Status: locally accepted on 2026-09-07. Implementation, source preservation, Windows/Linux checks, browser interactions, independent review and the generated saved-report library are recorded in [report library acceptance](report-library.md#verification). Direct file launch remains unobserved by the browser automation tool; the identical standalone HTML passed browser checks through a temporary loopback fixture server.

This round combines a read-only historical catalog, an offline review interface, command integration, and Windows/Linux verification. Existing assessment execution and the check/archive/share contracts remain unchanged.

The catalog inventories a supplied root with explicit depth/directory/entry/bundle limits. It checks detected bundles using the existing validators, groups exact duplicate artifact bytes within each profile, and derives only allowlisted result counts and provenance availability. Missing, malformed and inaccessible evidence stays visible; it does not become zero findings. A complete catalog is not complete assessment coverage.

`reports catalog <root>` prints a private JSON inventory. `reports library <root> <new-directory>` writes that inventory and a standalone interactive HTML page. Local folder names are private metadata; neither output is a sanitized share. Library publication refuses existing/overlapping destinations and rolls back owned partial files on ordinary failure. Partial directory discovery produces a failing catalog command and cannot be published as a completed library.

The page uses a searchable table, filters and a selected-report detail panel. All content is embedded; no external assets, network requests, assessments, replay or model calls occur. Source strings are rendered as inert text and the HTML carries a restrictive content policy. The UI labels invalid artifacts, missing provenance, duplicate copies and unknown values separately from assessment outcomes.

Acceptance requires meaningful directory-discovery, duplication, privacy, output-ownership, CLI and browser interaction checks; existing reporting regressions; clean Windows/Linux runs; independent review; updated documentation; and a usable private catalog of the saved report root when present. No dependencies, lockfiles, commits, remote settings, publication or deployment are changed. Stop when this complete round is accepted; do not expand into an assessment engine or a hosted report service.
