# php2shell Probe Testing

The `--exp-php2shell` probe was validated against 10 local Docker targets spanning the three common PHP server architectures (CLI built-in, PHP-FPM behind nginx, Apache mod_php), two PHP release branches (8.3.x and 8.4.x), patched and unpatched versions within each branch, one end-of-life branch (8.1), a third-party vulnerable application, and two non-PHP controls. Testing was performed on 2026-10-26.

The probe implements only step 1 of the php2shell chain, the worker crash via memory exhaustion (CVE-2026-109618). Step 2, code execution from the stale pointer (CVE-2026-109619), is never attempted.

For how to run the probe, its flags, verdict meanings, and the vulnerability background, see [exp-php2shell.md](exp-php2shell.md).

## Fixed Versions

The php2shell vulnerability was patched in PHP **8.2.35**, **8.3.36**, **8.4.27**, and **8.5.12**. Any version below its branch's fix is affected. PHP 8.1 and earlier are end-of-life and receive no official patch.

## Test Images

All PHP targets used the official PHP Docker Hub images ([docker.io/library/php](https://hub.docker.com/_/php)), pulled by exact version-variant tag. The non-PHP controls used official nginx and Node.js images.

| Target | Image | Tag | Affected |
|---|---|---|---|
| CLI server (unpatched) | [php](https://hub.docker.com/_/php) | `8.4.26-cli` | Yes (below 8.4.27) |
| CLI server (patched) | [php](https://hub.docker.com/_/php) | `8.4.27-cli` | No (patched) |
| FPM + nginx | [php](https://hub.docker.com/_/php) | `8.4.26-fpm` | Yes (below 8.4.27) |
| Apache mod_php (8.4) | [php](https://hub.docker.com/_/php) | `8.4.26-apache` | Yes (below 8.4.27) |
| Apache mod_php (8.3) | [php](https://hub.docker.com/_/php) | `8.3.35-apache` | Yes (below 8.3.36) |
| Apache mod_php (8.3 patched) | [php](https://hub.docker.com/_/php) | `8.3.36-apache` | No (patched) |
| Apache mod_php (EOL) | [php](https://hub.docker.com/_/php) | `8.1.0-apache` | Yes (EOL, no patch) |
| Static nginx | [nginx](https://hub.docker.com/_/nginx) | `stable` | N/A (no PHP) |
| Node.js HTTP server | [node](https://hub.docker.com/_/node) | `22-slim` | N/A (no PHP) |
| stealmybitcoin CTF app | See [dedicated section](#stealmybitcoin-ctf-app) | `php:8.4.26-cli` (in Dockerfile) | Yes (below 8.4.27) |

Each PHP image was run at its default configuration with no php.ini overrides unless noted. The FPM + nginx target used `client_max_body_size 64M` in the nginx config to allow the probe body through (explained in [Deployment-Specific Observations](#deployment-specific-observations)).

## Results

Two test passes were run against every target:

1. **CLI binary.** The shipped `shannon start --exp-php2shell` command, using all available signals (crash detection and version headers).
2. **Crash-only harness.** A direct module harness that strips `X-Powered-By` and `Server` headers from the control response before classification, forcing the classifier to rely solely on the crash signal.

### CLI Binary Results

| | Target | Image Tag | Verdict | Signal | Exit Code |
|---|---|---|---|---|---|
| ✅ | CLI server (unpatched) | `php:8.4.26-cli` | DETECTED | version-below-fix | 1 |
| ✅ | CLI server (patched) | `php:8.4.27-cli` | NOT DETECTED | version-patched | 0 |
| ✅ | FPM + nginx | `php:8.4.26-fpm` | DETECTED | version-below-fix | 1 |
| ✅ | Apache mod_php | `php:8.4.26-apache` | DETECTED | version-below-fix | 1 |
| ✅ | Apache mod_php | `php:8.3.35-apache` | DETECTED | version-below-fix | 1 |
| ✅ | Apache mod_php (patched) | `php:8.3.36-apache` | NOT DETECTED | version-patched | 0 |
| ✅ | Apache mod_php (EOL) | `php:8.1.0-apache` | DETECTED | version-below-fix | 1 |
| ✅ | Static nginx | `nginx:stable` | NOT DETECTED | no-observable-signal | 0 |
| ✅ | Node.js HTTP server | `node:22-slim` | NOT DETECTED | no-observable-signal | 0 |
| ✅ | stealmybitcoin CTF app | `php:8.4.26-cli` | DETECTED | fatal-error-in-band | 1 |

### Crash-Only Results (Version Headers Stripped)

| | Target | Image Tag | Verdict | Signal |
|---|---|---|---|---|
| ✅ | CLI server (unpatched) | `php:8.4.26-cli` | detected | fatal-error-in-band |
| ✅ | CLI server (patched) | `php:8.4.27-cli` | not_detected | no-observable-signal |
| ✅ | FPM + nginx | `php:8.4.26-fpm` | detected | empty-body-200 |
| ✅ | Apache mod_php | `php:8.4.26-apache` | detected | fatal-error-in-band |
| ✅ | Apache mod_php | `php:8.3.35-apache` | detected | fatal-error-in-band |
| ✅ | Apache mod_php (patched) | `php:8.3.36-apache` | not_detected | no-observable-signal |
| ✅ | Apache mod_php (EOL) | `php:8.1.0-apache` | detected | fatal-error-in-band |
| ✅ | Static nginx | `nginx:stable` | not_detected | no-observable-signal |
| ✅ | Node.js HTTP server | `node:22-slim` | not_detected | no-observable-signal |
| ✅ | stealmybitcoin CTF app | `php:8.4.26-cli` | detected | fatal-error-in-band |

**20/20 passed across both passes.** Zero false positives on patched PHP or non-PHP targets. Zero missed detections on unpatched targets. Every unpatched target produced a directly observed crash signal when version headers were unavailable.

## Deployment-Specific Observations

### CLI Built-in Server (`php -S`)

A single-process development server with no reverse proxy. The crash produces `fatal-error-in-band`: the PHP fatal error text ("Allowed memory size of N bytes exhausted") appears directly in the HTTP response body. Both 8.4.26 (unpatched) and 8.4.27 (patched) were tested, and the patched version handled the same crafted request without crashing.

### PHP-FPM + nginx

The standard production topology. When the FPM worker crashes, nginx receives an empty upstream response and forwards it as an empty HTTP 200. The crash signal is `empty-body-200`.

The probe body is approximately 7.4 MiB at full size. nginx's default `client_max_body_size` is 1 MiB, which rejects the probe with HTTP 413 before PHP-FPM sees it. The probe sends a smaller first attempt (~1 MiB) that fits under the default limit, but this does not generate enough memory pressure to crash the worker. For testing, `client_max_body_size 64M` was set in the nginx config. In production FPM deployments that accept file uploads, this limit is typically raised, which is the scenario where the probe reaches PHP.

When the body-size limit blocks both probe sizes, the probe reports `inconclusive`. A restrictive `client_max_body_size` is itself a valid defense-in-depth measure against this vulnerability.

### Apache mod_php

PHP runs as an Apache module in the same process. The crash signal is `fatal-error-in-band`, the same as the CLI server. When Apache's `html_errors` directive is on (the default), the fatal error text is wrapped in HTML tags. The classifier strips HTML before matching.

### Non-PHP Controls (Static nginx, Node.js)

Targets with no PHP runtime. The probe's multipart body is accepted and processed normally by the server. No crash signal is produced. The classifier returns `not_detected` with `no-observable-signal`.

### PHP 8.1.0 (End-of-Life)

PHP 8.1 is end-of-life and receives no official patch for this vulnerability. The only remediation for 8.1 deployments is upgrading to a supported branch (8.2+).

## stealmybitcoin CTF App

stealmybitcoin is a third-party CTF challenge application ([pavja2/smbc-source-oct-2026](https://github.com/pavja2/smbc-source-oct-2026)) built by an independent developer to let people test the php2shell exploit chain against a deliberately vulnerable target. The live instance at stealmybitcoin.com was taken down after someone completed the challenge, and the domain now serves a static GitHub Pages site. The source was published so others could run it locally.

The application's `Dockerfile` pins `php:8.4.26-cli` and runs a CLI built-in server with one POST endpoint (`/ping.php`). The Docker image was built from the published source and run locally. No modifications were made to the application code or PHP configuration.

The probe detected the crash with the `fatal-error-in-band` signal, the actual PHP fatal error text in the HTTP response body, not version-based detection.
