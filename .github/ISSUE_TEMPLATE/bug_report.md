---
name: Bug report
about: Create a report to help us improve
title: ''
labels: ''
assignees: ''

---

## Describe the bug

Provide a clear and concise description of the issue.

---

### Steps to reproduce

1. 
2. 
3. 

---

### Expected **behaviour**

Describe what you expected to happen.

---

### Actual **behaviour**

Describe what actually happened.

---

**Pre-submission checklist (required):**

- [ ]  I have searched the existing open issues and confirmed this bug has not already been reported.
- [ ]  I am running the latest released version of `shannon`.

**If applicable:**

- [ ]  I have included relevant error messages, stack traces, or failure details.
- [ ]  I have checked the audit logs and pasted the relevant errors.
- [ ]  I have inspected the failed Temporal workflow run and included the failure reason.
- [ ]  I have included clear steps to reproduce the issue.
- [ ]  I have redacted any sensitive information (tokens, URLs, repo names).

**Debugging checklist (required):**

Please include any **error messages, stack traces, or failure details** you find from the steps below.

Issues without this information may be difficult to triage.

- Check the audit logs at:`./audit-logs/target_url_shannon-123/workflow.log`
Use `grep` or search to identify errors.
Paste the relevant error output below.
- Temporal:
    - Open the Temporal UI:http://localhost:8233/namespaces/default/workflows
    - Navigate to failed workflow runs
    - Open the failed workflow run
    - In Event History, click on the failed event
    Copy the error message or failure reason here.

---

### Screenshots

If applicable, add screenshots of the audit logs or Temporal failure details.

---

### CLI details

Provide the following information (redact sensitive data such as repository names, URLs, and tokens):

- Authentication method used:
    - `CLAUDE_CODE_OAUTH_TOKEN`
    - `ANTHROPIC_API_KEY`
- Full `./shannon` command with all flags used (with redactions)
- Are you using any experimental models or providers other than default Anthropic models?
    - Yes/No
    - If Yes which one (model/provider)

---

### Desktop / Environment

Please complete the following information:

- OS (with version):
e.g. macOS 26.2
- Docker version (‘docker -v’):
Example: 25.0.3

---

### Additional context

Add any other context that may help us analyze the root cause.
