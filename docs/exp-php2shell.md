# php2shell Upgrade Verification

> **Experimental: not maintained long term.** This is an experimental capability, exposed behind the `--exp-php2shell` flag. It is provided as-is, may change or be removed without notice, and will not receive long-term maintenance or support.

> **Upgrade PHP immediately.** Fixed versions: **8.2.35**, **8.3.36**, **8.4.27**, **8.5.12**. Upgrade first, then use this tool to confirm the upgrade has landed.

The `--exp-php2shell` flag tests CVE-2026-109618, the first php2shell CVE: a PHP worker crash from an oversized `multipart/form-data` request. The probe sends a payload that triggers the crash and additionally checks the response headers for the PHP version. This flag is a single scripted probe and does not run the full Shannon pentest. Upgrade PHP regardless of the result.

> **This probe crashes a PHP worker.** The request it sends is designed to exhaust memory and kill one worker process. It is not a read-only check. The probe stops at the crash and never attempts the second-stage code execution. The worker respawns in milliseconds, but only run the probe where a brief crash is acceptable. Do not point it at endpoints where a momentary worker crash would cause problems.

## Usage

Upgrade PHP first, then run the probe against a staging or local deployment to confirm the fix landed:

```
npx @keygraph/shannon start --exp-php2shell -u https://staging.example.com
```

Before sending anything, the probe shows a confirmation prompt, because it will crash one PHP worker on the target.

### Flags

`-u <url>` **(required).** The target URL, including the path to test. One reachable PHP endpoint is enough, because the flaw is in the PHP interpreter, not in a specific route. To test more than one path, run the probe once per URL.

`-y`, `--yes` **(optional).** Auto-confirm the prompt for non-interactive runs (a script or CI job, where no one is at the keyboard). Interactively, just type `y` at the prompt.

`-o <dir>` **(optional).** Write the JSON report to this directory, useful when integrating the probe into a larger system. Without it, the result is only printed.

`-r` (repository) is **not used** by this mode and can be omitted.

### Safety

Run it against staging or local development, not production, unless you are explicitly authorized. A crashed worker respawns in milliseconds, but it is a real disruption (see the Safety Boundary section below).

## Verdicts

The crash is the main signal. The PHP version is only used as a fallback when the probe does not produce a crash.

**Detected** means the target looks vulnerable, for one of two reasons:

- A crash was detected. The probe crashed a PHP worker, which is direct evidence the vector is reachable.
- A vulnerable PHP version was detected. The response headers report a PHP version older than the fix.

**Not detected** means the probe found no evidence of the vulnerability:

- A patched PHP version was detected and no crash occurred.
- No crash occurred and the PHP version could not be read from the headers. This is the weakest result, because a crash can still happen with nothing visible from outside. Confirm the version directly on the server (see Caveats).

**Inconclusive** means the probe could not run to completion, so nothing can be concluded:

- The request was blocked before reaching PHP (for example by a firewall or a proxy request-size limit).
- The target did not respond to the initial baseline request.
- The baseline request returned a server error, so there was no healthy response to compare the probe against.
- The probe did not complete before the deadline. A slow target can cause this, and slowness on its own is not treated as a crash.

Upgrade PHP regardless of which verdict is reported.

## Validation

The probe was tested against a matrix of local PHP deployments: the CLI built-in server, PHP-FPM behind nginx, and Apache mod_php, across patched and unpatched 8.3 and 8.4 releases and an end-of-life 8.1 branch, alongside non-PHP controls and the stealmybitcoin CTF application. There were no false positives on the patched or non-PHP targets in these tests. A separate crash-only pass, with version headers stripped, confirmed that every unpatched target was detected by the crash itself rather than by the version string. The full matrix and per-deployment behavior are in [exp-php2shell-testing.md](exp-php2shell-testing.md).

---

The sections below explain the vulnerability and the probe in more detail, for anyone who wants the background.

## Background

On October 21, 2026, two critical vulnerabilities were disclosed in the PHP interpreter itself (not in any library or application code). Together they are known as "php2shell" and they allow unauthenticated remote code execution against any reachable PHP endpoint. The bugs were discovered by Wiz, reported responsibly, and patched in the versions listed above.

Because the flaw sits in the PHP interpreter rather than in application code, any site running an unpatched PHP version should upgrade regardless of how carefully the application itself is written. One endpoint is enough to test, since the parser runs the same way behind every route.

## Attack Sequence

The php2shell CVEs chain two steps. The first crashes a PHP worker through the multipart parser. The second builds on that crash to achieve code execution. Read more about the php2shell advisory here: [https://nvd.nist.gov/vuln/detail/CVE-2026-109618](https://nvd.nist.gov/vuln/detail/CVE-2026-109618)

The probe focuses on the first CVE only. The two steps are sequential, so if the crash cannot be triggered, the code execution step is not reachable through this chain.

## Safety Boundary

The tool reproduces **only step 1** of the exploit chain. It sends the crafted multipart body, observes the response, and stops. It never sends the follow-up request that would populate freed memory for code execution. Step 2 is never attempted.

A crashed worker process respawns in milliseconds (PHP-FPM) or is replaced by the next incoming request (mod_php). No persistent state is lost and no lasting damage occurs.  Run this against staging or local development, not production, unless specifically authorized to do so.

Before executing, the tool displays a confirmation prompt explaining exactly what it will do. Nothing is sent until explicitly confirmed.

## Version Detection

In addition to the crash probe, the tool reads the `X-Powered-By` response header, which PHP emits by default. If present, it extracts the PHP version and compares it against the fixed-version table. This is reported alongside the crash result as supplementary context.

This check is not definitive on its own. Many production deployments disable the header (`expose_php = Off` in php.ini), in which case there is nothing to read. Some Linux distributions also backport the fix under the original version number, which would make a patched server appear outdated by version string alone. The crash-based check is the primary signal. The version header is corroboration when available.

## Defense in Depth

Upgrading PHP is the fix. The following are supplementary measures that block the crash vector at the network edge, worth considering as additional layers:

- **Reverse proxy body-size limit.** A cap on incoming request bodies (nginx `client_max_body_size`, Apache `LimitRequestBody`) stops the crafted request before it reaches PHP. This also blocks a real attacker using this vector.
- **WAF rule for multipart complexity.** Rules that limit the number or size of multipart parts and headers stop this payload shape. Some WAF vendors have published rules targeting this CVE specifically.
- **PHP's own input limits.** Directives such as `max_multipart_body_parts` and `max_input_vars` bound how much the multipart parser will process. On patched versions the vulnerable path is already fixed. On any version, confirm these have not been raised to unsafe values.

These layers provide real protection and are good practice regardless. But they do not replace the upgrade. They are bets on catching every variant of the payload, while the upgrade eliminates the vulnerable code path entirely.

## Caveats

- If `expose_php` and `display_errors` are both off, the tool has no observable signal. The crash still occurs server-side but produces no externally visible evidence. The tool reports "not detected" with a note that the version could not be independently confirmed. Checking `php -v` on the server directly is the only way to verify in this configuration.
- Distro-backported patches (common on Debian, Ubuntu, RHEL) may fix the vulnerability under the original version number. The version-based check would report "detected" for a server that is actually patched. A missing crash signal does not by itself confirm that a backported fix is installed. Verify the package's patch status against the distribution's security advisory.
- PHP 8.1 and earlier are end-of-life and receive no official patch. The tool can confirm the crash is reachable, but the only remediation is upgrading to a supported branch (8.2+).
- Behind nginx or Apache, a request body-size limit at or below the full probe size blocks the probe before it reaches PHP. On PHP-FPM behind nginx at the default `client_max_body_size` of 1 MiB, the probe is rejected with a 413 and the result is inconclusive. Raising the limit for a controlled test, or probing PHP directly, lets the full probe through.

## Credits

The escalating probe-size strategy and multi-signal classification approach in this tool were informed by the design of Assetnote's php2shell scanner (MIT) (https://github.com/assetnote/php2shell-scanner).

