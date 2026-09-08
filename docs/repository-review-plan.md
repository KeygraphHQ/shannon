# Repository review implementation plan

Completed: all six implementation steps and R1–R7 are verified in [the acceptance record](goals/repository-review-acceptance.md).

The user approved [the bounded goal](goals/repository-review.md), including practical accuracy and autonomous routine implementation. The previous goal turn made concrete progress by creating, independently correcting and activating that specification. This plan implements it; it adds no approval gate or acceptance requirement.

## Design and ownership

- Root: shared repository types; immutable input fingerprints and ordering-independent observation identities from the same parsed bytes; isolated file worker integration; CLI/safe snapshot I/O; package/harness integration and documentation.
- Discovery author: `repository.ts` and `security-review-repository.test.mjs`. Bounded directory traversal, selectors/exclusions, portable per-file snapshots and aggregate deadlines.
- Comparison author: `comparison.ts`, `snapshot.ts` and `security-review-comparison.test.mjs`. Bounded schema/consistency validation, canonical snapshot identifiers and honest comparisons.
- Corpus author: separate `fixtures/repository-review/`, `security-review-repository-evaluation.test.mjs` and `scripts/evaluate-repository-review.mjs`. Fixed expected outcomes derived from the contract, then cross-reviewed independently.

No author edits another's assigned files without coordination. Root owns shared builds; authors can run isolated compilation or tests against agreed contracts. Existing source and user changes remain in place; no commits or worktrees are required.

## Implementation sequence

1. Freeze shared snapshot/comparison types and public signatures. Keep current single-file outputs unchanged.
2. Authors implement discovery, comparison/validation and independent fixtures in parallel. Root adds fingerprints/identities to a separate internal file-review response from one read/parse, with cancellation for aggregate deadlines.
3. Integrate `review repo` and `review compare`, explicit file selection, protected output creation and gate precedence. Add a concrete CI example using trusted reviewer code and inert input directories.
4. Run observed focused red/green tests, worker build, existing single-file regressions and the finite independent corpus. Correct demonstrated blockers. Cross-review modules and labels.
5. Run Windows clean-context and isolated Linux acceptance with existing harnesses; run reporting regressions after shared package/harness changes. Review ordinary repository configurations and record unchanged input bytes.
6. Record R1–R7 evidence, limitations and independent audit; complete the goal and stop.

## Contract decisions

- Repository snapshots contain relative paths, per-file fingerprints/results, opaque observation identities, an explicit policy and reviewed-engine digest. No timestamp or absolute checkout root enters matching.
- Conventional filenames and excluded directories are exported constants. Optional `include` entries carry a format and root-relative path; `exclude` entries are root-relative paths/prefixes. Excluded directories stay excluded even when explicitly selected.
- Snapshot observation identity describes the service/operation/security requirement and the relevant declared setting. Supported unordered lists do not use numeric positions as identity; evidence retains the current physical pointer. Unresolvable identity remains null/unknown.
- Comparison requires validated compatible snapshots and adequate coverage for each claimed introduction/removal. Complete compatible baseline inventory can establish that a new file was absent. Candidate file deletion yields unknown old observations. Exact-content moves can be identified conservatively; arbitrary rename inference is deferred.
- CLI snapshot files are new outputs only, outside selected input filenames; caller stdout remains available. Existing file commands retain their schema and exit behavior. No reviewed project scripts or external references execute.

The detailed goal remains the acceptance authority. Required examples must agree, but universal accuracy and an expanding test-count target are not part of this plan.
