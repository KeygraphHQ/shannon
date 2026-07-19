# Coverage and Roadmap

Shannon focuses on exploitable findings that can be validated against a running application.

## Current Shannon Coverage

- Broken Authentication
- Broken Authorization
- Injection
- Cross-Site Scripting
- Server-Side Request Forgery

## Reporting Philosophy

Shannon follows an evidence-backed exploitation model. The final report includes successful proof-of-concept exploits and real vulnerabilities supported by code or live evidence when a security control or external condition still blocks full impact after exhaustive documented attempts. Disproven hypotheses and candidates outside the authorized network-accessible surface remain audit-only.

This reduces speculative noise, but it also means Shannon does not aim to report every possible security issue in a repository. In particular, many dependency, policy, configuration, and broad static-analysis findings are outside the core Shannon workflow.

## Roadmap Direction

Planned coverage areas should continue to live in the repository's canonical roadmap document if one exists. The README should link to that document rather than carrying detailed roadmap history inline.

For organizations that need broader static and organizational coverage now, see [the Keygraph platform](keygraph-platform.md).
