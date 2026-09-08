# Independent repository review corpus

`expected-results.json` contains labels authored from the repository-review goal,
the frozen public snapshot contract, and the primary declaration specifications
listed beside each case. The discovery and comparison implementations were not
read, and their outputs were not used to establish these labels.

The root agent independently reviewed all 21 case rationales, snapshot expectations,
22 change labels, and 24 fixture files before execution. That reviewer did not
implement discovery or comparison and approved the labels without changes.

The 21 cases cover the goal's 14 named scenarios using 12 small synthetic projects.
The corpus is finite. Changes to expectations require a documented contract or
source rationale and independent review; a failed implementation does not justify
changing a label. These cases measure agreement with supported examples, not field
accuracy or complete security coverage.

The labels distinguish new declarations in existing files, genuinely new files
proved absent by complete compatible baseline inventory, retained declarations,
and removal from a still-present fully assessed file. Deleted files, ambiguous
content moves, unresolved declarations, and incompatible snapshots remain unknown.
Unknown records are counted independently of missed or unexpected known changes.
Reordering cases keep exact current pointers while preserving declaration identity.

Files under `projects/exclusions/build` are intentional fixtures for the default
generated-directory exclusion. They are source fixtures, not build products.
The Unicode project and filename exercise explicit selection and portable evidence.
All project bytes, including ignored content, are fingerprinted before and after
evaluation to detect unintended input changes. No real project, target, or external
reference is read; documentation URLs remain metadata.

The evaluator permits either partial or failed outcomes at aggregate resource
ceilings, as allowed by the goal. It requires incomplete inventory and visible
diagnostics, checks applicable bounds, and does not prescribe filesystem traversal
order. Its exact labels cover ordinary completed file analyses and comparison
states; fingerprints and reviewer identities are checked without locking an engine
build digest into expectations.

Run `node scripts/evaluate-repository-review.mjs` from the repository after building
the worker. The standalone evaluator emits a JSON report and exits 1 for mismatches
or execution failures. `--help` needs no compiled worker. The companion Node test
file checks the same corpus plus evaluator accounting with synthetic results.

CLI tests owned by the integration author separately verify protected output writes,
source preservation through the launcher, and execution of the documented local CI
example. This corpus does not claim those integration checks as evaluator coverage.
