# Understanding black-box results

The black-box Markdown evidence report starts with a run summary derived from the same recorded state as its JSON artifacts. It does not perform additional verification or change which findings are accepted.

| Measure | Interpretation |
| --- | --- |
| Run status | The recorded execution outcome, separate from the number of findings. Completion does not establish application security. |
| Reportable findings | Records in the exported findings list. Candidates and verifier verdicts are separate measures. |
| Saved traffic records | Normalized exchanges retained in the evidence inventory, not the total number of network requests. |
| Observed route groups | Distinct recorded route signatures representing request shapes. This is not a count of tested authorization controls. |
| Observed route/identity pairs | Distinct combinations present in recorded traffic. This does not establish that every identity or authorization relationship was tested. |
| Recorded authentication | Configured identities marked authenticated at capture time. The report does not recheck session validity. |
| Tasks and hypotheses | Counts by recorded lifecycle state. Open, queued, tested, and blocked hypotheses remain unresolved. These counts overlap with other measures. |
| Verifier records | Recorded verdicts, not findings automatically approved by the summary. |
| Rejected proposal records | Stored rejection records, which may include repeated task identifiers. They are not additional completed checks. |
| Stop explanation | The recorded termination reason for the result attempt when available; otherwise a reference to a recorded failure, or explicitly not recorded. An absent failure message does not establish an error-free run. |

`tested` and `no_demonstrated_impact` are not successful security checks. A zero-finding result does not assess unobserved routes or workflows. The report does not calculate a coverage percentage because it has no inventory of every application route and control.

The summary links to the companion traffic inventory, blackboard, and findings files. The four artifact names, findings-array format, finding acceptance, and execution behavior are unchanged. When supplied, optional `runMetadata` is included in the exported blackboard and displayed in the Markdown summary.

Recorded provenance distinguishes the stable run ID, the latest execution attempt, and the attempt that produced the reported result. Each recorded attempt carries its workflow ID, resume predecessor, start and end timestamps, worker code revision and digest, uncommitted-change flag, configured model, and recorded termination. A later resume or report repair can use different code or model configuration; it does not reattribute an earlier result to that later attempt. Copies preserve the original metadata.

The model field records configuration; it does not establish that a model call occurred or identify an immutable provider deployment behind a model alias. Worker code metadata describes the assessment worker, not the application's source revision. The SHA-256 digest covers installed worker JavaScript and excludes dependencies and prompts. Missing code information, incomplete earlier attempt history, an absent end timestamp, and unknown termination remain explicitly unknown. Rendering a report does not determine those values from the current environment or folder name.

For reviews of historical results:

- Keep each artifact set together. A missing or malformed findings file means its count is unavailable, not zero.
- Check for duplicate exports before interpreting repeated folders as independent assessments.
- Treat missing stop reasons, timestamps, and execution-version metadata as unknown. Folder names do not verify which model or code revision ran. Legacy exports without `runMetadata` retain the original unknown-value behavior.
- Do not feed an exported blackboard into code requiring an internal snapshot: exported files omit private state and some orchestration metadata.

Existing saved reports are not rewritten automatically. Newly rendered reports include the summary.

Local regression commands, the synthetic Temporal harness, and CI coverage are described in [Reporting checks](reporting-checks.md).

Run metadata is persisted under the synthetic target's `.shannon/run-metadata/` directory. `run.json` retains the run identity; each attempt owns a separate UUID-named file. New attempts link to the prior attempt, including a restart after startup failed before the regular session file existed. This records attempt lineage, not a claim that a particular checkpoint was restored. As with the assessment workspace, starting or resuming the same workspace must be serialized; simultaneous competing starts are not a supported audit history.

The worker records the attempt start using its clock. A workflow records its selected finalization time before dispatching the finalization activity; the metadata ending is committed only after the assessment's terminal state exists. A publication retry or repair retains that selected timestamp. These are assessment lifecycle times, not the duration of a particular model call. Worker and Temporal clocks can differ; the report does not infer a duration or reject recorded timestamps based on their ordering.

When the worker observes a closed Temporal execution, it can record interruption or execution failure with Temporal's close timestamp. A lost start response, a hard kill, a host failure, or an unavailable Temporal status does not establish an ending. Those attempts retain an unknown ending unless a close was observed. Such attempts may have only the metadata journal and no finalized evidence report. The journal can include a later execution observation that occurred after the report was published; the published report continues to describe its recorded assessment attempt.

For packaged images without Git metadata, the revision and dirty-checkout flag remain unknown. The worker JavaScript digest still identifies the installed JavaScript bytes when they can be read. No credentials or complete environment/configuration dumps are collected for provenance.
