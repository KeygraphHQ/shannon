<div align="center">

<img src="https://raw.githubusercontent.com/KeygraphHQ/shannon/main/assets/github-banner-light.png" alt="Shannon, AI Pentester for Web Apps and APIs, by Keygraph" width="100%">

### Shannon is an autonomous, AI pentester for web applications and APIs.

It analyzes your source code, identifies attack paths, and executes real exploits to prove vulnerabilities before they reach production.

**This package is Shannon Open Source: the full agent, run locally from your command line.**

---

<a href="https://discord.gg/9ZqQPuhJB7"><img src="https://raw.githubusercontent.com/KeygraphHQ/shannon/main/assets/discord_button_light.png" height="40" alt="Join Discord"></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://keygraph.io/"><img src="https://raw.githubusercontent.com/KeygraphHQ/shannon/main/assets/keygraph_button_light.png" height="40" alt="Visit Keygraph.io"></a>

---

</div>

## Quick Start

### Prerequisites

- **Docker**: required for the worker container.
- **Node.js 18+**: required for the recommended `npx` workflow.
- **AI provider credentials**: Shannon runs on Anthropic, OpenAI, xAI, AWS Bedrock, any other provider in the harness catalogue, and any endpoint that speaks the Anthropic Messages API or the OpenAI Chat Completions or Responses API through a custom base URL. You bring your own key, and Keygraph never proxies your model traffic. Shannon is provider-agnostic.
- **Cyber safeguards cleared with your provider**: Anthropic and OpenAI apply real-time safeguards to cyber-security workloads, which can interrupt a scan mid-run. Complete their guidance for legitimate security testers before your first run.

### Run Shannon

> **Warning:** Shannon actively executes exploits. Run it only against applications and environments you own or have explicit written authorization to test. Do not run Shannon against production systems.

```bash
# Configure credentials with the interactive wizard.
npx @keygraph/shannon setup

# Run a pentest against a source-available target.
npx @keygraph/shannon start -u https://your-app.com -r /path/to/your-repo
```

Shannon pulls the worker image from Docker Hub, starts the required local infrastructure, mounts the target repository read-only inside an ephemeral worker container, and writes results to a local workspace.

## Editions

Shannon ships in two ways. **Shannon Open Source** is this package: the standalone pentester you run yourself, on demand, and complete in that lane. The **Keygraph platform** is the commercial product that runs an enhanced build of Shannon continuously and closes the full AppSec lifecycle around it - code analysis, finding management, automated remediation, verification, and enterprise deployment.

## Documentation

**Full README, guides, and usage documentation:** [github.com/KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon#readme)

## License

Shannon Open Source is licensed under the [GNU Affero General Public License v3.0](https://github.com/KeygraphHQ/shannon/blob/main/LICENSE).

Commercial and enterprise licensing is available for organizations that need different license terms, commercial support, private redistribution, managed-service use, or broader deployment options, including the Keygraph platform.

For commercial licensing, contact [shannon@keygraph.io](mailto:shannon@keygraph.io).

<p align="center">
  <b>Built by <a href="https://keygraph.io">Keygraph</a></b>
</p>
