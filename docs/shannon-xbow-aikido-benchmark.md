**TL;DR.** Doyensec recently published a side-by-side of Aikido and XBOW on two open-source apps. We ran Shannon v3, our open-source pentester, against the same Photoview deployment with three different models. All three caught the critical SQL injection; the cheapest run cost $6.10 in tokens. The Claude Opus 5 run found 23 verified issues for $115, against Aikido's 32 and XBOW's 7 at $4,000 each. 

| Model | Report | SARIF |
| --- | --- | --- |
| DeepSeek v4 Flash | [View report](../benchmark/photoview-deepseek-v4-flash.pdf) | [SARIF](../benchmark/photoview-deepseek-v4-flash.sarif) |
| Grok 4.6 | [View report](../benchmark/photoview-grok-4-6.pdf) | [SARIF](../benchmark/photoview-grok-4-6.sarif) |
| Claude Opus 5 | [View report](../benchmark/photoview-opus-5.pdf) | [SARIF](../benchmark/photoview-opus-5.sarif) |

|  | Shannon v3 (DeepSeek v4 Flash) | Shannon v3 (Grok 4.6) | Shannon v3 (Claude Opus 5) | Aikido | XBOW |
| --- | --- | --- | --- | --- | --- |
| Cost | $6.10 | $35.07 | $115 | $4,000 | $4,000 |
| Scan time | 2h 37m | 5h 26m | 2h 24m | < 8h | ~2 days |
| Reported | 18 | 10 | 24 | 32 | 7 |
| True positives | 18 | 10 | 23 | 32 | 7 |
| False positives | 0 | 0 | 1 | 0 | 0 |
| Severity agreement | 72% | 50% | 62% | 66% | 57% |

# Introduction

In Comparing AI Application Security Testing Platforms, an Aikido-sponsored study, Doyensec ran Aikido's Attack AI Pentest and XBOW's Lightspeed against two randomly selected self-hosted apps, Fider 0.33.0 and Photoview 2.4.0. Both platforms received source code and credentials. A Doyensec researcher validated every finding by hand, a different researcher per platform, and re-scored it for severity. 

Fider and Photoview have similar stacks, Go backends with React frontends, so either would exercise the same parts of Shannon. We chose Photoview. Both apps have shipped security fixes since the versions Doyensec tested, which gives us a partial ground truth for recall below. Photoview's fixes landed in July 2026 and Fider's in April, and the later batch reduces the chance the models saw the fixes in training. 

---

## Benchmark Setup

We ran Shannon against Photoview version 2.4.0, using a deployment that matched the one Doyensec tested: MariaDB, standalone username/password authentication, and two seeded accounts (one admin and one normal user). Similar to the XBOW setup, which received only the admin account,  we gave Shannon just the admin credentials only.

This was our setup run:

```
./shannon start \
  -u http://host.docker.internal:4800 \
  -r ~/photoview-v240/repo \
  -c ~/photoview-v240/config.yaml
```

`config.yaml`

```yaml
agentic_sast:
  enabled: "true"

exploit: "true"

report:
  sarif: "true"

authentication:
  login_type: form
  login_url: "http://host.docker.internal:4800/login"
  credentials:
    username: "admin"
    password: "PhotoviewAdmin!2026"
  login_flow:
    - "Go to http://host.docker.internal:4800/login"
    - "Type $username into the Username field"
    - "Type $password into the Password field"
    - "Click the Sign in button"
```

The scan config was optional and only carried login details. Shannon started its local infrastructure, mounted the target repository read-only, and wrote its results to a local workspace.

## Results

### Photoview 2.4.0

|  | Shannon 3.0 (Deepseek v4 Flash) | Shannon 3.0 (Opus 5) | Shannon 3.0 (Grok 4.6) | Aikido |  XBOW |
| --- | --- | --- | --- | --- | --- |
| Cost | $6.10 | **$115** | $35.07 | $4,000 | $4,000 |
| Time | 2h 37min | 2.4h | 5h 26m | < 8h | ~2 days |
| Reported | 18 | 24 | 10 | 32 | 7 |
| True positives | 18 | 23 | 10 | 32 | 7 |
| False positives | 0 | 1 | 0 | 0 | 0 |
| Exact severity agreement | 72% | 62% | 50% | 66% | 57% |

Once our reports generated, we went through and verified the accuracy of our finding( how many were true positives, and how accurate were the severity ratings.)

### The one false positive

Opus flagged `userAddRootPath` (INJ-02) as missing path confinement. It's an admin-only feature for registering local media directories on a host the admin already controls, so the agent read an intended feature as an exploit. Shannon still rated it Low rather than escalating it, but it points to a broader problem we are working on: enhancing business logic understanding. the same code is an exploit in one app and a feature in another, so before an agent can tell the two apart it has to understand the full context of the app it is testing.

### **Comparing Shannon’s findings to Photoview’s security fixes**

The tables below list the security vulnerabilities Photoview patched after the commit used for each scan and show which ones each model flagged. We built the list by scraping Photoview’s commit history after the scanned version for security-related keywords, then reviewing the matching commits. Photoview’s maintainers chose to fix these issues independently of our benchmark. When a Shannon finding matches one of those fixes, it’s a strong signal that the finding represents a real problem the maintainers cared enough to patch.

Most notably, all three models flagged the critical SQL injection that Photoview has since patched. The bug turned one endpoint into a boolean oracle, letting an unauthenticated attacker read the entire database. Every scan caught it, regardless of model. At these price points, it’s exciting because results like this can widen access to meaningful security testing.

The other clear signal is how coverage changes with model strength. Opus, the heaviest model, caught 6/7 of the patched vulnerabilities, including the more nuanced, higher-severity issues. Grok caught 3/7: the critical issue, one high, and one medium. DeepSeek also caught 3/7: the critical issue and two mediums.

As the price point dropped, coverage of the subtler, higher-severity findings fell off, but every model still caught the most urgent issue. That supports the cadence we had in mind for Shannon. Teams can run Grok or DeepSeek regularly, then bring in Opus periodically to catch the harder findings.

### Photoview findings compared to patched vulnerabilities

| Vulnerability Photoview patched | CVSS 3.1 | Commit / PR | Opus 5 | Grok 4.6 | DeepSeek v4 Flash |
| --- | --- | --- | --- | --- | --- |
| Pre-auth SQL injection in the album-download route | 9.8 Critical | `deb1b216` / PR #1453 | ✅ INJ-01 | ✅ INJ-01 | ✅ INJ-01 |
| Share-link authz: admin check tested the token owner, not the caller | 8.1 High | `3512ca26` / PR #1452 | ✅ AUTHZ-03 | ✅ AUTHZ-05 | ❌ |
| WebSocket session never re-validated after upgrade | 8.1 High | `95d3d16a` / PR #1353 | ✅ MISC-01 | ❌ | ❌ |
| Share-token expiry never enforced | 5.3 Medium | `2b1240b8` #1202 · `2598c362` #1348 | ✅ AUTH-04 | ✅ AUTHZ-07 | ✅ AUTH-06 |
| Unauth nil-pointer panic / DoS on unknown `/api/photo` & `/api/video` | 5.3 Medium | `27a0b082` #1201 · `2b1240b8` #1202 | ✅ MISC-03 | ❌ | ❌  |
| WebSocket origin check fails open (cross-site WS hijack) | 4.7 Medium | `eeb8d0e9` #1363 · `95d3d16a` #1353 | ✅ AUTH-06 | ❌ | ✅ AUTH-09 |
| Malformed EXIF GPS data accepted (media-parsing input validation) | 4.3 Medium | `df9af39a` / PR #951 | ❌ | ❌ | ❌ |
| **Total** |  |  | **6 / 7** | **3 / 7** | **3 / 7** |

### Severity Discussion

To assess our severity ratings, we manually scored each true finding against CVSS 3.1 and compared it to the severity we had originally reported. Admittedly, we had a fair amount of adjusting to do, but in most cases the reported severity was only one band off its CVSS equivalent, and never wildly exaggerated. More rigorous CVSS scoring is on our roadmap.

We also noticed a number of findings that could fall under an “informational” category. Most were already reported as Low, so it is less about correcting inflated severities and more about giving them a more precise label. We plan to eventually move these types of finding into a more accurate category.

### Cost and Scan time

For Doyensec’s study, Aikido’s Standard tier and XBOW’s Plus tier each cost $4,000 per scan. Against that baseline, our $115 Opus scan of Photoview was 35x cheaper. The $35.07 Grok scan was 114x cheaper, while the $6.10 DeepSeek scan was 656x cheaper.

Time also differed. Once the Photoview target was ready, all three Shannon runs finished in under five and a half hours. Doyensec reported just under eight hours for Aikido’s Photoview scan. XBOW’s Photoview scan started on April 6, and the final report arrived on April 8 with no interruptions. These aren’t like-for-like scanner runtimes. They do show the operational difference between Shannon’s same-day local runs and XBOW’s multi-day process.

**Ensembling**

Ensembling, or running multiple models and merging their outputs, is a proven way to boost coverage and reliability. The benchmark results above reflect only single-model runs, meaning there is still significant performance left on the table.

For example, Grok and DeepSeek each found three of the seven patched vulnerabilities, but their findings didn't perfectly overlap. Merging their reports would cover four out of seven vulnerabilities for just $41. A multi-model approach also acts as a built-in critic: a second model verifying trust boundaries would likely have caught Opus's single false positive (INJ-02).

While Shannon doesn’t natively orchestrate ensembling yet, its architecture makes it incredibly easy to implement. Because Shannon is BYOM (bring your own model) and outputs standard SARIF files, merging and deduplicating results from different models is straightforward when paired with your favorite agentic coding tool. All of this can be done seamlessly in a CI flow.

#### Deploy this in your CI system today

Shannon v3 runs headlessly in GitHub Actions or GitLab CI. Run `npx @keygraph/shannon setup` once on the runner to store your provider key. After that, the pipeline calls `npx @keygraph/shannon start` with the target URL and repo path. Shannon pulls the worker image, mounts the checkout read-only in a throwaway container, scans, and exits. The only traffic that leaves your runner goes to the model provider you configured.

Exploit-mode scans write SARIF 2.1.0 by default, so findings land in GitHub code scanning or GitLab's vulnerability report alongside your other scanners. Out of the box, the run fails on Critical or High findings. Lower severities show up as annotations, and the threshold is configurable.

### Conclusion

The complaint we hear most from CISOs about AI pentesting isn't accuracy, it's cost. At $4,000 a scan, the tier Doyensec purchased from both XBOW and Aikido, the math works for an annual check-up. It doesn't work per release, and teams are shipping faster than ever. A large enterprise with 5,000 repositories is looking at $20 million for a single pass.

Shannon v3 running DeepSeek v4 Flash scanned Photoview for $6.10 and caught the same critical SQL injection the $4,000 platforms caught. The same enterprise would pay about $30,000 for that pass. The cheap model doesn't catch everything: our Claude Opus 5 run found 6 of 7 patched vulnerabilities to DeepSeek's 3, for $115. That's the point. Run the cheap model on every change, run the heavy one on a schedule, and continuous pentesting becomes affordable.