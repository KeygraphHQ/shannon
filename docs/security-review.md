# Offline security configuration review

Review a local project or one OpenAPI/Compose file and receive structured configuration observations with remediation and source locations. Save repository snapshots to compare new, unchanged, removed and unknown observations. The six checks examine local declarations. They do not establish deployed behavior, exploitability, or overall assessment accuracy.

## Run

Use Node.js 22 or newer and the repository's pnpm 10.33.0. Acceptance was observed on Node 22, Windows x64 and Linux. No new dependencies were added.

```sh
pnpm install --frozen-lockfile
pnpm --filter @shannon/worker build
pnpm --silent review --help
pnpm --silent review openapi "path to/api.yaml"
pnpm --silent review compose "path to/compose.yml"
pnpm --silent review compose "path to/compose.yml" --fail-on-findings
```

The equivalent Node command is `node scripts/review.mjs <openapi|compose> <file>`. Help works before installing dependencies or building. Review commands need no model credentials, running target, Docker daemon, or network connection. Docker is needed only for the Linux verification command below.

| Exit | Meaning |
| --- | --- |
| 0 | Completed the supported declaration checks, possibly with findings |
| 1 | Partial/failed analysis or missing build/runtime prerequisites |
| 2 | Invalid command usage |
| 3 | Completed analysis with findings and `--fail-on-findings` enabled |

Incomplete analysis takes precedence over the findings gate. Treat `status`, `scope.rules`, and `diagnostics` as part of the result; an empty `issues` array alone is not a clean outcome.

## Supported checks

| Rule ID | Observation | Boundary |
| --- | --- | --- |
| `openapi/undeclared-security-scheme` | A requirement names an absent local security scheme | Unresolved definitions are incomplete, not absent |
| `openapi/undeclared-oauth-scope` | An OAuth2 requirement names a scope absent from all valid local flows | OpenID discovery stays unknown; non-OAuth roles are not OAuth scopes |
| `compose/privileged` | A service container explicitly requests privileged mode | Explicit privilege requests in build and lifecycle hooks receive unsupported-context diagnostics |
| `compose/host-namespace` | A service explicitly requests host network or host PID mode | Does not propagate effective namespaces through service references |
| `compose/unconfined-profile` | A service selects unconfined seccomp or AppArmor | Does not open profile files or infer runtime defaults |
| `compose/expanded-capabilities` | A service adds `ALL` or `SYS_ADMIN` | Does not infer effective grants from capability drops or runtime settings |

OpenAPI 3.0.x and 3.1.x declarations are accepted; the retained core fixtures use 3.0.4 and 3.1.1. Other versions receive diagnostics. Root and explicit operation requirements are checked at their physical source locations. AND members, OR alternatives, empty overrides and anonymous alternatives retain their specification meaning. Used callbacks, 3.1 webhooks and supported same-document references are traversed with limits; unused component callbacks and unrelated example/schema content are not searched for security requirements. OAuth scope availability is the union of valid local flows. Invalid required metadata or security structures produces diagnostics while independently supported observations are retained. The implementation is not a full OpenAPI schema validator. Semantics follow the [OpenAPI 3.0.4](https://spec.openapis.org/oas/v3.0.4.html#security-requirement-object) and [3.1.1 security requirement definitions](https://spec.openapis.org/oas/v3.1.1.html#security-requirement-object).

Compose checks use the current service declaration model, reviewed on 2026-09-07. Quoted boolean forms supported by Compose are recognized. Capability names follow Docker case normalization, including `CAP_SYS_ADMIN`; `CAP_ALL` is not treated as `ALL`. Both supported security-option separators are accepted, with `=` taking precedence over `:`. Literal profiles do not erase declarations. A non-Linux platform, unresolved interpolation, includes, inheritance or delegated lifecycle can leave the result partial. Valid local service namespace references remain non-host declarations; their runtime effects are not propagated. These checks cover service-container settings, not general Compose validity or every privilege mechanism. See the [Compose service reference](https://docs.docker.com/reference/compose-file/services/), [Compose boolean conversion](https://raw.githubusercontent.com/compose-spec/compose-go/v2.9.1/loader/interpolate.go) and [Docker capability normalization](https://raw.githubusercontent.com/moby/moby/v28.0.0/oci/caps/utils.go).

## Result and API

`schemaVersion: 1` results contain `format`, `status`, `source.file`, enforced `limits`, per-rule `scope`, `issues`, and `diagnostics`. `completed` means the supported checks finished; `partial` means semantic coverage remains incomplete; `failed` means the input or execution could not be processed within the contract. Every result states `scope.basis: "local-declarations"` and `scope.deployedState: "not-assessed"`.

Each issue has a stable rule ID, classification (`contract-consistency` or `configuration-risk`), applicability (`declared`), fixed message and remediation, and `evidence: { file, pointer }`. Evidence pointers use [RFC 6901 escaping](https://www.rfc-editor.org/rfc/rfc6901.html). Diagnostics are separate, include affected rule IDs, and identify missing coverage. Prose omits source values; file paths and pointer tokens are private metadata and can disclose identifiers. The output is not a sanitized sharing format.

After the worker build, workspace consumers can import the typed API:

```ts
import { reviewFile, type ReviewResult } from '@shannon/worker/security-review';

const result: ReviewResult = await reviewFile('compose', '/absolute/path/compose.yml', {
  maxBytes: 1_048_576,
  timeoutMs: 10_000,
});
```

Source-checkout scripts can import `./apps/worker/dist/security-review/index.js`. Optional limit overrides may only tighten positive integer ceilings. Same input bytes, path and limits produce the same structured result when processing completes within those limits; no timestamp or random identifier is inserted.

## Input boundaries

The reviewer accepts one UTF-8 JSON or YAML document. A `.json` extension enforces strict JSON syntax; YAML never rescues invalid JSON. YAML uses JSON-compatible value types from installed js-yaml 4.1.1. Duplicate keys, non-string mapping keys, custom tags, cyclic aliases, merge keys and multiple documents are rejected. Ordinary acyclic aliases are supported within the shared expansion budget.

| Bound | Ceiling |
| --- | --- |
| Input bytes | 4 MiB |
| Nesting depth | 64 |
| Parsed value nodes, including alias expansion | 100,000 |
| Alias/local-reference expansions per input | 1,000 |
| Isolated processing deadline, including process startup | 30 seconds |
| Child V8 old-space limit | 128 MiB |
| Result capacity | 1,000 combined issues/diagnostics and 1 MiB serialized JSON |

Budget exhaustion produces an explicit partial or failed result; it never silently truncates into completed coverage. The parser checks depth while parsing, then checks the resulting graph before rule analysis. The caller terminates the fixed child process at the deadline and waits for its exit. The memory setting is a V8 heap bound, not an operating-system total-memory guarantee.

Files must be regular, singly linked files under real directories. Symbolic links, junction ancestors, hard links, Windows UNC/device paths and alternate streams are rejected. Reads are bounded and recheck identity and metadata. The command does not modify inputs or resolve external references, includes, environment files, profile files or implicit siblings. Literal `$$` escapes remain literal; unresolved Compose substitutions receive diagnostics. External file mounts controlled by the host are outside the reader's ability to establish locality. As with ordinary portable path APIs, metadata rechecks are not an atomic filesystem snapshot against a concurrent privileged writer.

## Example and verification

The repository-owned example is:

```sh
pnpm --silent review compose apps/cli/infra/compose.yml
```

Observed on 2026-09-07: exit 0, `status: "completed"`, all four Compose families assessed, `issues: []`, `diagnostics: []`, and unchanged input bytes. This means no matching explicit request was found in the four supported families. It does not certify the service, image, mounted data or deployment. The full result and input hash are retained in the [acceptance evidence](goals/defensive-review-acceptance.md).

```sh
pnpm test:review
pnpm --silent eval:review
pnpm test:review:linux
pnpm test:review:install
# Optional existing cache for a frozen clean install:
pnpm test:review:install --offline --store-dir .pnpm-store
```

`test:review` builds the worker and runs rule, parser, independent-review, corpus and CLI checks plus focused formatting/syntax checks. The Linux harness builds from an explicit fresh context and runs as a non-root user with networking disabled. The install harness creates a fresh dependency tree, uses a frozen lockfile with install scripts disabled, builds, and runs review plus reporting regressions. Both remove only their owned temporary resources.

The independent corpus contains 41 cases: two positive, two negative and two ambiguous cases per rule family, plus five parser failures. The evaluator compares exact issue labels, classifications, applicability, file/pointer evidence and completion state. False positives, false negatives and abstentions are reported separately with denominators. Agreement with these fixtures is not field accuracy or comprehensive coverage. See [the completion record](goals/defensive-review-acceptance.md) for observed checks and remaining product gaps.

## Repository snapshots and comparison

Review a project directory using the same six checks:

```sh
mkdir output
pnpm --silent review repo "path to/baseline project" --output output/baseline.json
pnpm --silent review repo "path to/candidate project" --output output/candidate.json
pnpm --silent review compare output/baseline.json output/candidate.json
pnpm --silent review compare output/baseline.json output/candidate.json --fail-on-new-findings
```

Both snapshots must come from the same installed reviewer and selection policy. Existing snapshot files are never overwritten. Choose new names for another run. The output parent must already exist without linked ancestors; inside the reviewed root, store snapshots under a default excluded directory such as `output`. JSON also goes to stdout. Shell redirection has the shell's own overwrite behavior, so use `--output` for protected storage. Output failure can leave a newly created incomplete file; the failed command never reports a successful snapshot write. Protected output operations share the command's remaining 120-second processing budget.

Default recursive discovery uses these exact, case-sensitive basenames: `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`, `openapi.json`, `openapi.yaml`, and `openapi.yml`. It always excludes directory segments `.agents`, `.codex`, `.git`, `.pnpm-store`, `build`, `coverage`, `dist`, `node_modules`, `output`, and `workspaces`. It does not sniff unrelated contents or use `.gitignore` as selection policy.

Explicit includes add files with other names. Exclusions match a relative path and its descendants; exclusions always win. Paths use `/`, are relative to the supplied root, and cannot contain traversal, Windows device names, links or alternate streams. Spaces and Unicode are supported. Repeat flags to select several paths:

```sh
pnpm --silent review repo "my project" --include "openapi:specs/service contract.yaml" --include "compose:infra/development.yaml" --exclude vendor --exclude tests
```

A missing explicit selection produces incomplete coverage. Deliberately excluded scope appears in `discovery.skipped`; unsupported or unreadable selected files and discovery failures remain visible. An empty complete inventory means no supported files were selected. It is not a statement about overall project security.

The version 1 snapshot has `kind: "offline-repository-review"`, a content-derived `id`, reviewer identity, selection `policy`, limits, discovery counters/skips, and per-file outcomes. Each file has a root-relative path, format, SHA-256 of the exact bytes parsed, byte count, single-file result, and evidence-bearing observations. Failed reads/parses may have null fingerprints. `files.length`, per-file `result.status`, and `discovery` distinguish inventory from coverage. No absolute checkout root or timestamp is saved. Determinism applies to stable inputs and supported completion; concurrent filesystem changes are explicit failures, not an atomic tree snapshot.

Comparison validates both snapshots before trusting their structure: exact schema, safe paths, file/rule coverage, issue/observation consistency, bounded sizes and content IDs. `sealSnapshot` validates and hashes an envelope; it does not authenticate its author or prove declarations were honestly reviewed. Saved messages, paths and pointers remain private producer-supplied data. No snapshot field selects code or external resources.

| Change | What it establishes |
| --- | --- |
| `new` | The observation was absent from adequately assessed baseline file/rule coverage, or its file was absent from a complete compatible baseline inventory |
| `unchanged` | A unique declaration identity is present on both sides; candidate evidence preserves its current pointer |
| `removed` | The observation is absent from adequately assessed candidate declarations; deployed remediation is not established |
| `unknown` | Coverage, compatibility or matching cannot establish a supported change state |

Deleted, unreadable and unsupported candidate files cannot establish removal. Incomplete baseline inventory cannot establish that a newly observed file was absent. Supported file/rule comparisons survive unrelated incomplete files, but aggregate status remains partial. Exact-content moves and repeated/ambiguous identities produce separate unknown records for each side. Arbitrary rename or refactoring inference is deferred.

Declaration identity hashes the rule and its local context. Compose identity retains service, property and normalized capability/profile value. OpenAPI identity retains operation/root context, the requirement's sorted scheme-key conjunction, referenced scheme and missing scope value. Supported capability, security-option, OR-requirement and scope-list ordering does not determine identity; evidence array indices still describe the current file. Repeated equivalent declarations are deliberately ambiguous.

The reviewer digest hashes the installed local review implementation and parser version, normalizing source line endings. Changes to implementation can conservatively invalidate a baseline even if a particular rule behaves identically. Regenerate both snapshots with one build; there is no automatic baseline migration.

Repository/comparison exits retain the single-file conventions: `0` completed, `1` incomplete/failed, `2` usage error, and `3` supported new observations when `--fail-on-new-findings` is enabled. Unknown or incomplete analysis takes precedence over that gate. A malformed or missing snapshot fails comparison with no asserted changes.

```ts
import {
  reviewRepository, compareSnapshots, compareSnapshotFiles, validateSnapshot,
  type RepositorySnapshot, type RepositoryComparison,
} from '@shannon/worker/security-review';

const baseline: RepositorySnapshot = await reviewRepository('/local/baseline', {
  include: [{ format: 'openapi', path: 'specs/service.yaml' }],
  exclude: ['vendor'],
  limits: { maxFiles: 64 },
});
const candidate = await reviewRepository('/local/candidate', {
  include: [{ format: 'openapi', path: 'specs/service.yaml' }],
  exclude: ['vendor'],
  limits: { maxFiles: 64 },
});
const delta: RepositoryComparison = compareSnapshots(baseline, candidate);
// For saved untrusted JSON, this loader bounds and isolates both file reads:
const savedDelta = await compareSnapshotFiles('/local/baseline.json', '/local/candidate.json');
```

Invalid options, unavailable reviewer identity, total deadline exhaustion or an envelope that cannot fit its snapshot limit reject the repository API with fixed errors. Other bounded discovery/file failures produce a partial or failed snapshot. `validateSnapshot` rejects invalid input; `compareSnapshots` returns a failed comparison instead of throwing on invalid snapshots. The in-memory API accepts plain data, rejects accessors/proxies, and validates with a shared 30-second comparison deadline. Use the isolated file loader when consuming saved inputs.

| Aggregate bound | Ceiling |
| --- | --- |
| Discovered filesystem entries | 10,000 |
| Selected files | 128 |
| Directory depth beneath root | 24 |
| Selected input bytes reserved from discovery | 32 MiB |
| Repository processing, including reviewer identity and sealing | 120 seconds |
| Concurrent file-review processes | 2 |
| Each snapshot input/output | 16 MiB |
| Snapshot comparison including file loading | 30 seconds |

Public limit overrides only tighten ceilings. Existing per-file limits still apply. At the exact entry budget, inventory can remain conservatively incomplete because proving directory EOF would require another read. A partially enumerated directory contributes no arbitrarily ordered prefix of selected files. Pending filesystem operations may finish after cancellation, but no subsequent discovery reads or queued file reviews are launched; owned review children are terminated.

## Local CI example

The inert [workflow example](examples/repository-review-ci.yml) installs/builds this reviewer and runs a controlled local comparison demonstration. Its action revisions match the existing reporting workflow, with read-only contents permission and checkout credential persistence disabled, following the [checkout documentation](https://github.com/actions/checkout) and [pnpm setup documentation](https://github.com/pnpm/action-setup). It is saved under `docs/examples`, so it does not schedule or publish a GitHub workflow.

Run its analysis commands locally after setup:

```sh
node scripts/repository-review-ci-example.mjs
pnpm eval:repository-review
pnpm test:review
pnpm test:review:install --offline --store-dir .pnpm-store
pnpm test:review:linux
```

The demonstration uses retained synthetic projects, writes new snapshots in an owned temporary directory, and checks unchanged (exit 0), newly introduced (exit 3), and incomplete (exit 1) comparisons. The demonstration itself succeeds only when all three expected outcomes hold. A real project gate should invoke `review compare ... --fail-on-new-findings` directly and preserve its exit code. Install/build runs reviewer setup; analysis never starts services or runs reviewed project scripts. Remote CI execution is not part of local acceptance.

The finite repository corpus separates unexpected/missed known changes from unknown outcomes and checks all fixture bytes for preservation. Its expected states and exact evidence pointers were labeled independently before execution. Passing these scenarios establishes those workflows, not population accuracy. Remaining scope includes only these six declaration checks; additional formats/rules, Git-history analysis, rename inference, snapshot migration and deployed-state verification are deferred.
