# LocalSourceGenerator

Generates synthetic source code from black-box reconnaissance, enabling Shannon
to perform penetration testing without access to actual application source code.

## Usage

```bash
# Generate synthetic source
./local-source-generator.mjs https://example.com

# Run Shannon with synthetic source
./shannon.mjs https://example.com ./shannon-workspace/repos/example. com
```
## Features
- Network reconnaissance using nmap, subfinder, whatweb
- Active crawling to discover endpoints
- JavaScript analysis for API endpoints and auth code
- Generates pseudo-source files for Shannon
