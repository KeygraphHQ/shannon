# Feature Specification: Running Security Scans

**Feature Branch**: `002-security-scans`
**Created**: 2026-01-17
**Status**: Draft
**Input**: User description: "Epic 2: Running Security Scans (.doc/saas/prd.md)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Scan (Priority: P1)

As a developer evaluating Shannon, I want to run my first security scan with minimal configuration so that I can see value quickly without investing significant setup time.

**Why this priority**: This is the core value proposition - users need to experience a working scan before anything else. Without a quick, successful first scan, users will not engage with other features.

**Independent Test**: Can be fully tested by entering a URL and clicking "Scan" - delivers immediate security findings without requiring any configuration.

**Acceptance Scenarios**:

1. **Given** I am logged in and have created a project, **When** I enter only a target URL and click "Start Scan", **Then** a security scan begins within 5 seconds without requiring additional configuration.

2. **Given** a scan is in progress, **When** I view the scan page, **Then** I see real-time progress updates showing current phase, percentage complete, and estimated time remaining.

3. **Given** a scan has completed, **When** I view the results, **Then** I see a summary of findings categorized by severity (critical, high, medium, low, informational).

4. **Given** I want to stop a running scan, **When** I click "Cancel Scan" and confirm, **Then** the scan stops gracefully and any partial results are saved and accessible.

---

### User Story 2 - Authenticated Testing (Priority: P2)

As a developer, I want to configure authentication so that Shannon can test protected areas of my application beyond the login page.

**Why this priority**: Most web applications require login to access core functionality. Without authenticated scanning, only public pages are tested, severely limiting security coverage.

**Independent Test**: Can be tested by configuring login credentials and verifying the scan accesses authenticated endpoints that would otherwise return 401/403 responses.

**Acceptance Scenarios**:

1. **Given** I am configuring a scan, **When** I select an authentication method, **Then** I can choose from form-based login, API token, Basic Auth, or SSO.

2. **Given** I am configuring form-based authentication, **When** I enter login credentials and click "Test Authentication", **Then** the system validates the credentials work before starting the scan and shows a clear success or failure message.

3. **Given** my application uses two-factor authentication, **When** I configure authentication, **Then** I can provide a TOTP secret so Shannon can generate valid 2FA codes during the scan.

4. **Given** authentication fails during a scan, **When** I view the scan status, **Then** I see a specific error message indicating authentication failed (not a generic "scan failed" message) with guidance on how to fix it.

5. **Given** I have configured authentication for a project, **When** I start a new scan, **Then** the saved authentication configuration is automatically applied unless I explicitly change it.

---

### User Story 3 - Scan History and Details (Priority: P3)

As a developer, I want to view my scan history and drill into specific scan details so that I can track my security testing activity and review past results.

**Why this priority**: After running scans, users need to access historical results and understand what was tested. This enables ongoing security monitoring and audit trails.

**Independent Test**: Can be tested by running multiple scans and verifying each appears in history with accurate metadata and accessible details.

**Acceptance Scenarios**:

1. **Given** I have run multiple scans, **When** I view the scan history page, **Then** I see a list showing date, status, duration, and findings count for each scan, sorted by most recent first.

2. **Given** I am viewing scan history, **When** I click on a specific scan, **Then** I see detailed information including start time, duration, target URL, authentication method used, and a breakdown of findings by severity.

3. **Given** I am viewing scan history, **When** I use filters, **Then** I can filter scans by status (completed, running, cancelled, failed) and date range.

4. **Given** a scan completed with findings, **When** I view the scan details, **Then** I can navigate directly to the findings list for that specific scan.

---

### User Story 4 - Scheduled Scans (Priority: P4)

As a DevOps engineer, I want to schedule recurring security scans so that my applications are continuously monitored without manual intervention.

**Why this priority**: Scheduled scans enable continuous security monitoring which catches new vulnerabilities introduced over time. This is a key differentiator from manual pentesting.

**Independent Test**: Can be tested by creating a weekly schedule and verifying scans execute automatically at the configured times.

**Acceptance Scenarios**:

1. **Given** I am configuring a project, **When** I set up a schedule, **Then** I can choose from preset frequencies (daily, weekly) or define a custom schedule.

2. **Given** I have configured a scheduled scan, **When** the scheduled time arrives, **Then** a scan automatically starts and I receive an email notification when it completes.

3. **Given** I have an active scan schedule, **When** I want to temporarily stop it, **Then** I can pause the schedule without deleting the configuration, and resume it later.

4. **Given** I am viewing scan history, **When** I look at a scan entry, **Then** I can distinguish between manually triggered scans and scheduled scans.

5. **Given** I have multiple environments (staging, production), **When** I configure schedules, **Then** I can set different scan frequencies for each environment.

---

### User Story 5 - CI/CD Integration (Priority: P5)

As a senior engineer, I want to integrate security scanning into my CI/CD pipeline so that I can automatically block pull requests that introduce critical vulnerabilities.

**Why this priority**: CI/CD integration shifts security left in the development process, catching vulnerabilities before they reach production. This represents a significant value proposition for engineering teams.

**Independent Test**: Can be tested by installing the integration, opening a PR with a known vulnerability, and verifying the PR check fails with appropriate feedback.

**Acceptance Scenarios**:

1. **Given** I want to add Shannon to my CI/CD pipeline, **When** I follow the setup instructions, **Then** I can install and configure the integration in under 5 minutes.

2. **Given** Shannon is integrated with my repository, **When** a pull request is opened, **Then** a security scan runs automatically on the PR changes.

3. **Given** a PR scan completes with findings, **When** I view the PR, **Then** I see a comment summarizing the scan results with severity breakdown and a link to the full report in Shannon.

4. **Given** I want to configure scan behavior, **When** I edit the integration settings, **Then** I can set a severity threshold that determines when PRs are blocked (e.g., block on critical/high only).

5. **Given** a PR is blocked due to findings, **When** I determine the finding is a false positive, **Then** I can override the block with a justification that is recorded for audit purposes.

---

### Edge Cases

- What happens when a target URL is unreachable during a scan? The scan should fail gracefully with a clear network error message and not consume quota.

- How does the system handle authentication expiration mid-scan? The scan should attempt to re-authenticate; if that fails, it should save partial results and report the authentication failure.

- What happens if a scheduled scan conflicts with a manually triggered scan for the same project? The system should queue the second scan and run it after the first completes.

- How does the system handle extremely long-running scans? Scans timeout after 60 minutes by default, saving partial results. Users receive warnings as scans approach the limit.

- What happens when the CI/CD integration cannot reach the Shannon service? The PR check should fail open (allow) with a warning rather than blocking development indefinitely.

- What if a user cancels a scan immediately after starting it? The system should cancel cleanly without creating orphaned resources or incomplete records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to start a scan with only a target URL (no additional configuration required)
- **FR-002**: System MUST display real-time scan progress including current phase, percentage complete, and estimated time remaining
- **FR-003**: System MUST support cancellation of running scans with graceful shutdown and preservation of partial results
- **FR-004**: System MUST provide authentication configuration supporting form-based login, API tokens, Basic Auth, and SSO
- **FR-005**: System MUST support TOTP-based two-factor authentication by accepting a secret key for code generation
- **FR-006**: System MUST validate authentication credentials before starting a scan and provide specific error messages if validation fails
- **FR-007**: System MUST persist authentication configuration at the project level for reuse across scans
- **FR-008**: System MUST maintain a complete history of all scans with metadata including date, status, duration, and findings count
- **FR-009**: System MUST allow filtering scan history by status and date range
- **FR-010**: System MUST provide detailed scan information including timing, configuration used, and findings breakdown
- **FR-011**: System MUST support scheduled scans with configurable frequency (daily, weekly, custom)
- **FR-012**: System MUST send email notifications when scheduled scans complete
- **FR-013**: System MUST allow pausing and resuming scan schedules without losing configuration
- **FR-014**: System MUST provide GitHub CI/CD integration (via GitHub Actions) that can be installed and configured in under 5 minutes
- **FR-015**: System MUST automatically trigger scans on pull request events when CI/CD integration is enabled
- **FR-016**: System MUST post scan results as comments on pull requests with severity summary and report link
- **FR-017**: System MUST support configurable severity thresholds for blocking pull requests
- **FR-018**: System MUST allow authorized overrides of blocked PRs with recorded justification
- **FR-019**: System MUST encrypt stored authentication credentials at rest using organization-specific encryption keys
- **FR-020**: System MUST retain scan history and results for 12 months before automatic deletion
- **FR-021**: System MUST limit concurrent scans to 3 per organization by default, with the limit configurable per organization
- **FR-022**: System MUST queue additional scan requests when the concurrent limit is reached and process them in order
- **FR-023**: System MUST enforce a default maximum scan duration of 60 minutes, after which the scan times out with partial results saved
- **FR-024**: System MUST display inline error banners with retry buttons when data loading fails, preserving last loaded data when available
- **FR-025**: System MUST redirect users to login with return URL and display session expiration toast when authentication expires
- **FR-026**: System MUST support exporting scan findings in PDF format (human-readable) and JSON format (machine-readable)
- **FR-027**: System MUST emit structured logs and track key metrics including scan duration, success rate, and queue depth

### Key Entities

- **Scan**: Represents a single security test execution with target URL, configuration, status (pending | running | paused | completed | failed | cancelled), timing, and results reference
- **ScanConfiguration**: Defines how a scan should be executed including authentication settings and scan parameters
- **AuthenticationConfig**: Stores credentials and authentication method for accessing protected resources
- **ScanSchedule**: Defines recurring scan frequency and associated project/configuration
- **ScanResult**: Contains findings, timing metrics, and deliverables from a completed scan
- **CICDIntegration**: Links a Shannon project to an external repository for automated PR scanning

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can start their first scan within 60 seconds of creating a project
- **SC-002**: 85% of scans complete successfully without errors or cancellation
- **SC-003**: Users receive real-time progress updates at least every 5 seconds during active scans
- **SC-004**: Authentication validation provides pass/fail feedback within 10 seconds
- **SC-005**: Users can configure authentication using the UI without requiring any YAML or configuration files
- **SC-006**: Scheduled scans execute within 5 minutes of their configured time
- **SC-007**: CI/CD integration can be installed and configured in under 5 minutes
- **SC-008**: PR scan results appear as comments within 2 minutes of scan completion
- **SC-009**: 90% of users can successfully complete a scan on their first attempt

## Clarifications

### Session 2026-01-17

- Q: How should stored authentication credentials be protected at rest? → A: Encrypted at rest using organization-specific keys
- Q: How long should scan history and results be retained? → A: 12 months (1 year)
- Q: How many concurrent scans per organization? → A: 3 concurrent scans (default), configurable per organization
- Q: What is the maximum scan duration before timeout? → A: 60 minutes (1 hour) default maximum
- Q: Which CI/CD platforms to support at MVP? → A: GitHub only (MVP); post-MVP: GitLab, Azure DevOps, Bitbucket
- Q: What scan states should the dashboard display? → A: Standard states: pending, running, paused, completed, failed, cancelled
- Q: How should dashboard handle data loading failures? → A: Inline error banner with retry button, preserve last loaded data if available
- Q: How should session expiration be handled? → A: Redirect to login with return URL, show toast explaining session expired
- Q: What export formats for scan findings/reports? → A: PDF and JSON (human-readable + machine-readable)
- Q: What observability signals for scan operations? → A: Structured logs + key metrics (scan duration, success rate, queue depth)

## Assumptions

- Users have valid target URLs that are accessible from Shannon's scanning infrastructure
- Users have appropriate authorization to run security scans against their targets
- Email delivery infrastructure is available for notifications
- GitHub provides stable webhook/integration APIs for GitHub Actions integration (MVP scope)
- Authentication credentials provided by users are valid for the target application
- Scans execute using the existing Shannon penetration testing engine
