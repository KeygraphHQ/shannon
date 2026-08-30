# Black-Box Burp Authorization Hunter

Status: Approved for implementation design on 2026-08-30.

## Objective

Add a source-hidden black-box mode to Shannon that helps an AI agent find replayable authorization and workflow vulnerabilities in web applications. The first version uses Luna during development and Burp Suite as the HTTP system of record. It must increase useful hunting capability rather than add a general scanner, evaluation framework, or reporting platform.

The observable contract is:

1. The operator supplies a target URL and at least two named identities.
2. Shannon authenticates and explores the target through isolated browser sessions.
3. Burp records the resulting HTTP traffic.
4. A deterministic orchestrator maintains the objective, task state, and shared evidence blackboard.
5. Bounded recon, analysis, and action workers contribute structured evidence without passing narrative context to one another.
6. A planner repeatedly selects the next highest-value work from the current evidence.
7. An independent verifier replays candidate proofs from fresh identity state.
8. Shannon reports a finding only when that replay proves unauthorized data access or a persistent state change.
9. If no proof works, Shannon reports no finding.

## Scope

The first version covers horizontal and vertical authorization failures plus multi-step workflow authorization mistakes. Anonymous access is an implicit third identity.

The following work is out of scope:

- Injection, XSS, SSRF, and broad authentication testing.
- Source-code analysis or mounting the target repository.
- A new intercepting proxy, crawler framework, scanner portfolio, budget harness, or sandbox redesign.
- Automatic vulnerability-report submission.
- Automatic changes to Burp listeners or other Burp project settings. The operator supplies a dedicated Docker-reachable listener; Shannon only validates it.
- A Daybreak-versus-Luna comparison harness. Luna is the development model; Daybreak is reserved for an occasional ceiling check.
- A generic multi-agent platform. The orchestrator, workers, evidence schema, and verifier are specific to black-box authorization and workflow hunting.

## Observed Starting Point

Shannon is currently a white-box pipeline. Its CLI requires a repository, its worker mounts that repository, and its prompts and output validators assume source-backed reconnaissance. It supports one configured login identity.

Shannon already provides reusable capabilities:

- Codex subscription-backed model execution.
- Named Playwright browser sessions and persisted storage state.
- Temporal workflow execution and resume.
- Structured agent tools and output validation.
- Per-run workspaces, scratch space, and evidence files.

The installed Burp MCP exposes target traffic history, raw HTTP request sending, WebSocket history, and Repeater export. The MCP SSE service is reachable from the worker container at `host.docker.internal:9876` when the request uses the service's expected host header. Burp's existing proxy listener is running on port 8080 in loopback-only mode, so it is not reachable from the worker container.

## User Interface

Black-box mode is explicit:

```text
shannon start --blackbox -u <target-url> -c <config> -w <workspace>
```

In black-box mode:

- `--repo` is not required.
- Supplying `--repo` is rejected so source cannot be exposed accidentally.
- `vuln_classes` may be omitted or contain only `authz`; any other class is rejected.
- `exploit` may be omitted or set to `"true"`; `"false"` is rejected because unverified candidates are not findings.
- The singular white-box `authentication` field is rejected; `identities` is required.
- Existing white-box commands and configuration remain unchanged.

The target configuration adds named identities. Each identity reuses the existing authentication contract:

```yaml
identities:
  - name: alice
    role: regular-user
    authentication:
      login_type: form
      login_url: https://target.example/login
      credentials:
        username: alice@example.test
        password: example-password
      success_condition:
        type: url_contains
        value: /app
  - name: bob
    role: regular-user
    authentication:
      login_type: form
      login_url: https://target.example/login
      credentials:
        username: bob@example.test
        password: example-password
      success_condition:
        type: url_contains
        value: /app
```

Identity names must be unique and safe for filenames. Each identity requires a non-empty role label and authentication block. The first version requires between two and five identities. Existing scope rules continue to constrain URLs, methods, headers, and parameters. `code_path` rules are rejected in black-box mode.

Burp integration settings are runtime settings rather than target configuration:

- `SHANNON_BURP_MCP_URL`, defaulting inside Docker to `http://host.docker.internal:9876`.
- `SHANNON_BURP_MCP_HOST_HEADER`, defaulting to `127.0.0.1:9876` for the current Burp MCP service.
- `SHANNON_BURP_PROXY_URL`, set to the temporary Docker-reachable Burp listener.

## Architecture

### Isolated target workspace

The CLI creates a synthetic writable target root for black-box runs. It mounts only the current run workspace and does not mount `repos/`, the selected target checkout, or sibling workspaces. Existing delivery, audit, browser-output, and git-checkpoint code continues to use a non-null internal `repoPath` that points at this synthetic root.

This preserves Shannon's internal path contracts without pretending that source exists. Black-box prompts identify the directory only as evidence and scratch storage.

The black-box agent process retains `bash` and file tools because replay scripts and evidence handling require them. Source hiding is enforced by the Docker mount boundary, not by prompt wording.

### Orchestrator and planning loop

Black-box mode selects a separate Temporal workflow. The workflow is the authoritative orchestrator: it owns the objective, scope, current evidence revision, task lifecycle, identity leases, and stopping decision. Workers cannot create untracked work or communicate through prose handoffs.

After bootstrap, the orchestrator runs a bounded feedback loop:

1. A planner receives a compact blackboard snapshot and returns a typed batch of recon, analysis, or action tasks.
2. The orchestrator rejects duplicate, out-of-scope, or conflicting tasks.
3. Independent recon and analysis tasks may run concurrently. Action tasks are serialized in the first version so target mutations and identity state cannot collide.
4. Worker results are schema-validated and merged into the blackboard as facts, hypotheses, actions, or candidate proofs.
5. Candidate proofs go to the independent verifier. Disproved or incomplete candidates return to the planner with the observed failure evidence.
6. The loop ends when the planner identifies no evidence-backed work with plausible customer, application, or user impact, or when the workflow reaches its hard safety limit.

The hard safety limit prevents an accidental infinite workflow; it is not an evaluation or spend-accounting subsystem. Hitting it produces an incomplete-run result rather than a clean assessment.

The white-box pre-recon, source recon, five vulnerability-analysis agents, five exploitation agents, and broad report agent do not run in this mode.

### Worker roles

Workers receive a task, a minimal relevant evidence slice, target scope, and only the tools required for that role:

- `blackbox-recon` drives one leased browser identity, exercises a bounded workflow, and submits observed exchanges, resources, ownership relationships, and state transitions.
- `blackbox-analysis` reads normalized exchanges and application artifacts, correlates identities and object references, and submits testable hypotheses. It cannot mutate the target.
- `blackbox-action` executes one approved replay or workflow mutation and submits the exact observed outcome. It cannot expand the target origin or invent follow-up work.
- `blackbox-verifier` receives only the reproduction inputs and proof condition, not the candidate's title, severity, or claimant conclusion. It recreates required state with fresh browser sessions and independently classifies the proof as verified, disproved, or blocked.

The planner is advisory. It prioritizes work and escalation but cannot mutate the target, verify its own candidate, or publish a result.

### Shared evidence blackboard

The blackboard is a versioned JSON document in the run workspace, updated only by deterministic merge code. Burp remains the raw HTTP system of record. The blackboard stores references and security meaning rather than duplicating the entire proxy project.

Its first schema contains:

- Target scope and run status.
- Identity names, roles, authentication status, and browser-state references.
- Captured exchanges and normalized route signatures.
- Resources, object identifiers, owners, visibility, and relationships.
- Observed workflows and state transitions.
- Hypotheses with preconditions, expected attacker capability, evidence references, priority, and status.
- Executed actions and replay outcomes.
- Candidate proofs and independent verification results.
- Planner tasks with status, evidence dependencies, and identity lease requirements.

Every record has a stable identifier and provenance. Each worker submits its base blackboard revision; stale or conflicting writes are rejected and replanned rather than silently merged.

### Burp connection

The worker uses the official MCP client SDK to connect to the configured Burp SSE endpoint. Shannon exposes only a narrow target-scoped tool set selected for each worker role:

- Read HTTP history for the configured target origin.
- Send an HTTP/1.1 or HTTP/2 request to the configured target origin.
- Read target-scoped WebSocket history when present.
- Create a Repeater tab only for a replay-verified finding.

No worker can read unrelated Burp history, change Burp configuration, toggle interception, or send requests to another origin through these tools. Analysis and planner workers receive read-only normalized evidence rather than raw replay tools.

Before starting a model, preflight verifies that the configured Burp listener is reachable from the worker and that a target-scoped request sent through it appears in Burp history. Shannon does not change Burp project settings. During development, the operator-authorized setup may add a dedicated listener and must restore the previous settings after each test run.

### Traffic capture and identity attribution

Playwright runs one isolated browser session per configured identity through Burp. Shannon processes identities sequentially during initial capture so traffic windows do not overlap.

For black-box sessions, Shannon adds the configured proxy to Playwright's generated browser launch options and enables browser-context HTTPS error bypass so Burp's interception certificate does not block navigation. These settings apply only to the synthetic black-box target root.

For each identity, Shannon:

1. Reads the complete target-scoped history and records the existing exchange hashes.
2. Performs login and verifies the configured success condition.
3. Saves browser storage state in a separate identity file.
4. Explores the authenticated application.
5. Reads the target-scoped history again and attributes the new exchange hashes to that identity.
6. Stores raw messages in the run workspace and exposes a normalized inventory through the agent tools.

Each captured exchange receives an `exchange_id` derived from a SHA-256 hash of its raw request, identity, and capture sequence. A separate `route_signature` is derived from method, normalized origin and path, query-key set, and body shape after volatile authentication and CSRF material is removed. The normalized record includes identity, method, origin, path, query keys, body content type, candidate object references, response status, response content type, and a bounded response fingerprint. Cookies, bearer tokens, credentials, CSRF values, and other secrets are redacted from normalized inventory and final evidence.

Duplicate requests are collapsed only when method, normalized URL, body shape, identity, and response behavior match. Distinct state transitions remain distinct.

### Replay and action control

The planner may propose a replay task, but the orchestrator must approve its scope and assign it to a `blackbox-action` worker. The high-level replay tool accepts:

- Captured request identifier.
- Acting identity or `anonymous`.
- Explicit path, query, header, form, or JSON-body mutations.
- A stated proof condition.

The replay service loads the raw request, removes the original authentication material, applies the selected identity's current cookies or authorization header, applies the requested mutation, and sends the request through Burp to the original target origin. When a request contains identity-bound CSRF or workflow material and no equivalent captured request exists for the acting identity, the tool returns `needs_fresh_actor_request`; the agent must obtain that request through the acting identity's browser session before replaying it.

The service records the exact replay request and response in the run-local raw corpus. The worker receives a redacted transcript plus response comparison data. The service never follows a redirect to another origin without an explicit in-scope rule.

### Finding acceptance and impact invariant

A status-code difference is not a finding. Every candidate must state and demonstrate this invariant:

```text
As an attacker, I could <demonstrated action>, causing <concrete effect> to <customer, application, or users>.
```

The action worker must provide a reproducible candidate proof containing:

- The victim or privileged identity that created or owns the resource or state.
- The attacker identity or anonymous context.
- The baseline request identifier.
- The exact mutation and replay sequence.
- The observed unauthorized data marker or persistent state change.
- A clean verification request that confirms the impact.
- Preconditions and concrete user impact.

The verifier repeats the candidate from fresh identity state. Only its verified result can be promoted to a finding. The output validator rejects findings that lack any required field, reference unknown evidence, use an out-of-scope origin, or rely only on UI visibility, status codes, generic hardening, information without demonstrated consequence, or speculative impact.

Information exposure and best-practice observations may remain hypotheses while the planner identifies a plausible escalation. If further action does not demonstrate impact, the orchestrator closes them as `no_demonstrated_impact`; they do not appear in results.

Confirmed findings are optionally opened in Burp Repeater with a stable finding identifier. Repeater export is not itself evidence.

### Output artifacts

Black-box mode writes only four capability artifacts:

- `traffic_inventory.json`, containing normalized exchanges and route signatures.
- `blackbox_blackboard.json`, containing task state, evidence relationships, hypotheses, actions, and verifier decisions.
- `blackbox_authz_findings.json`, containing zero or more validated findings.
- `blackbox_authz_evidence.md`, containing redacted, replayable evidence for those findings or the explicit no-findings result.

It does not run Shannon's broad report assembly in the first version.

## Failure Behavior

The run fails explicitly when:

- Burp MCP or the dedicated Proxy listener is unreachable.
- The configured Burp Proxy listener does not produce target-scoped history.
- Fewer than two identities authenticate successfully.
- No target-scoped traffic is captured.
- Traffic cannot be attributed to an identity.
- A replay response is missing or malformed.
- A resume changes mode, target origin, identity names, or Burp integration scope.
- A worker submits evidence against a stale blackboard revision and replanning cannot resolve it.

An empty, valid hunting result is reported as `no replay-verified findings`. It is not reported as a clean security assessment of routes or workflows that were not exercised.

## Verification

Implementation uses the existing `node:test` pattern and starts with failing tests for the changed contracts.

Required automated checks:

1. Config parsing accepts valid black-box identities and rejects duplicate names, fewer than two identities, invalid names, and `code_path` rules.
2. Existing white-box configuration and CLI behavior remain unchanged.
3. Black-box CLI construction omits the target repository mount and mounts no sibling workspace.
4. The real tool list for each worker role enforces its browser, evidence, and target-mutation boundaries.
5. Burp history normalization redacts secrets, assigns stable identifiers, preserves meaningful state transitions, and rejects another origin.
6. Replay replaces authentication material, applies one declared mutation, preserves the remaining request, and blocks another origin.
7. Blackboard merging accepts fresh typed evidence, rejects stale revisions and fabricated references, and preserves provenance.
8. The orchestrator permits parallel independent recon or analysis, serializes action tasks, and rejects identity-lease conflicts.
9. Planner output cannot directly publish findings or execute actions.
10. Verification uses fresh identity state and receives no claimant conclusion or severity.
11. Finding validation accepts an independently verified impact proof and rejects status-only, fabricated-request, missing-verification, information-only, and out-of-scope evidence.
12. Startup and agent execution never mutate Burp listener configuration.

Required integration checks:

1. Connect to the user's running Burp MCP and perform a target-scoped health request.
2. Route a disposable Playwright browser through the dedicated Burp listener and observe the request in Burp history.
3. Run the Luna orchestrator and worker loop against the pinned local Memos instance without mounting or prompting with its source.
4. Independently replay every emitted finding. If none replay, report no finding.

The local Memos run validates the mechanism; it does not establish a vulnerability-finding advantage by itself. A later Daybreak run on one fresh authorized black-box target measures the practical ceiling after the Luna implementation works.

## Completion Criteria

The first version is complete when one command can run the source-hidden authz workflow with two identities, the orchestrator can plan and dispatch evidence-backed work, Burp captures and serves the traffic, action workers can execute identity-swapped replays, and every reported finding has a fresh independent verification that demonstrates the attacker-impact invariant. Existing white-box behavior must still pass its current checks.
