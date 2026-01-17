# Feature Specification: Reporting & Compliance

**Feature Branch**: `004-reporting-compliance`
**Created**: 2026-01-17
**Status**: Draft
**Input**: User description: "Epic 4: Reporting & Compliance"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Security Report (Priority: P1)

As a security analyst, I want to generate a professional security report from my scan results so that I can communicate findings to stakeholders and document remediation recommendations.

**Why this priority**: Report generation is the primary value delivery mechanism. Scan findings are only useful when they can be communicated effectively to development teams and stakeholders. This is the core output of any penetration testing workflow.

**Independent Test**: Can be fully tested by completing a scan and generating a downloadable report - delivers immediate documentation value without requiring any other features.

**Acceptance Scenarios**:

1. **Given** a scan has completed with findings, **When** I click "Generate Report", **Then** I can select from available report templates (Executive Summary, Technical Detail, Compliance-Focused) and generate a report within 30 seconds.

2. **Given** I am generating a report, **When** I select the Executive Summary template, **Then** the report includes a risk score, critical findings summary, business impact analysis, and prioritized remediation roadmap suitable for non-technical stakeholders.

3. **Given** I am generating a report, **When** I select the Technical Detail template, **Then** the report includes detailed vulnerability descriptions, proof-of-concept steps, affected endpoints, and technical remediation guidance for development teams.

4. **Given** a report has been generated, **When** I view the report, **Then** I can download it in PDF, HTML, or JSON format.

5. **Given** I have generated a report, **When** I return to the scan details later, **Then** I can access previously generated reports without regenerating them.

---

### User Story 2 - Compliance Framework Mapping (Priority: P2)

As a compliance officer, I want scan findings mapped to relevant compliance frameworks so that I can demonstrate security posture during audits and identify compliance gaps.

**Why this priority**: Compliance mapping transforms raw vulnerability data into audit-ready documentation. Organizations under regulatory requirements need this to demonstrate due diligence and track remediation against specific compliance controls.

**Independent Test**: Can be tested by selecting a compliance framework and verifying findings are correctly categorized against framework controls with gap analysis.

**Acceptance Scenarios**:

1. **Given** I am viewing scan results, **When** I select a compliance framework (OWASP Top 10, PCI-DSS, SOC 2, CIS Controls), **Then** I see findings organized by the framework's control categories with coverage percentage.

2. **Given** findings are mapped to a framework, **When** I view a specific control, **Then** I see which vulnerabilities impact that control, the severity, and the remediation status.

3. **Given** I am generating a compliance report, **When** I select a framework, **Then** the report includes a compliance scorecard showing pass/fail status for each control with evidence references.

4. **Given** multiple scans exist for a project, **When** I view compliance trends, **Then** I see how compliance coverage has changed over time with a trend graph.

5. **Given** a control has no associated findings, **When** I view the compliance mapping, **Then** the control shows as "Not Tested" rather than assuming compliance.

---

### User Story 3 - Export and Share Reports (Priority: P3)

As a security analyst, I want to export reports in multiple formats and share them with stakeholders so that findings can be distributed to relevant parties for remediation and review.

**Why this priority**: Report distribution enables collaboration and accountability. Different stakeholders need different formats - executives want PDFs, developers want structured data, and compliance teams need audit-ready documents.

**Independent Test**: Can be tested by generating a report, exporting it in each available format, and sharing via email link - each export should be complete and properly formatted.

**Acceptance Scenarios**:

1. **Given** a report has been generated, **When** I choose to export, **Then** I can select from PDF (print-ready), HTML (web viewable), JSON (machine-readable), and CSV (spreadsheet) formats.

2. **Given** I want to share a report, **When** I click "Share", **Then** I can enter email addresses and an optional message, and recipients receive an email with a secure time-limited link to view the report.

3. **Given** I have shared a report, **When** I view the report's share history, **Then** I see who accessed the report and when, for audit purposes.

4. **Given** I receive a shared report link, **When** the link has expired (default 7 days), **Then** I see a clear message that the link has expired and instructions to request a new share from the report owner.

5. **Given** I am exporting to CSV, **When** the export completes, **Then** the CSV includes all findings with columns for severity, title, description, affected URL, compliance mappings, and remediation status.

---

### User Story 4 - Scheduled Reports (Priority: P4)

As a DevOps engineer, I want to schedule automated report generation and distribution so that stakeholders receive regular security updates without manual intervention.

**Why this priority**: Automated reporting enables continuous security communication and reduces manual overhead. Teams can establish regular security review cadences without remembering to generate reports.

**Independent Test**: Can be tested by creating a weekly report schedule and verifying reports are automatically generated and distributed at the configured times.

**Acceptance Scenarios**:

1. **Given** I have a project with completed scans, **When** I configure a report schedule, **Then** I can set frequency (weekly, monthly), select a report template, choose compliance frameworks to include, and specify recipients.

2. **Given** a report schedule is active, **When** the scheduled time arrives, **Then** the system generates a report from the most recent completed scan and emails it to configured recipients.

3. **Given** no new scans have completed since the last scheduled report, **When** the scheduled time arrives, **Then** the system either skips generation with a notification or generates a "no new findings" summary (configurable).

4. **Given** I have an active report schedule, **When** I want to pause it temporarily, **Then** I can pause without deleting the configuration and resume later.

5. **Given** scheduled report generation fails, **When** I check the schedule status, **Then** I see the failure reason and the system retries once before marking as failed and notifying me.

---

### User Story 5 - Compliance Dashboard (Priority: P5)

As a compliance officer, I want a dashboard showing compliance posture across all projects so that I can identify organization-wide security gaps and track remediation progress.

**Why this priority**: Organization-wide visibility enables strategic security decisions and resource allocation. Compliance officers need aggregate views to report to leadership and auditors on overall security posture.

**Independent Test**: Can be tested by running scans across multiple projects and verifying the dashboard accurately aggregates compliance metrics with drill-down capability.

**Acceptance Scenarios**:

1. **Given** I have multiple projects with completed scans, **When** I view the compliance dashboard, **Then** I see an aggregate compliance score across all projects for my selected framework.

2. **Given** I am viewing the compliance dashboard, **When** I click on a specific control category, **Then** I see which projects have gaps for that control and can drill down to specific findings.

3. **Given** compliance data exists over time, **When** I view the dashboard, **Then** I see a trend graph showing compliance score changes over the selected time period (30, 60, 90 days).

4. **Given** I want to report on compliance to leadership, **When** I click "Export Dashboard", **Then** I receive a PDF summary suitable for executive presentation with key metrics and trends.

5. **Given** multiple compliance frameworks are configured, **When** I view the dashboard, **Then** I can switch between frameworks to see posture against each one.

---

### User Story 6 - Custom Report Templates (Priority: P6)

As a senior security analyst, I want to customize report templates so that reports match my organization's branding and include the specific sections relevant to our stakeholders.

**Why this priority**: Template customization enables professional-grade deliverables that match organizational standards. This differentiates Shannon reports from generic tool output and supports client-facing consulting use cases.

**Independent Test**: Can be tested by creating a custom template with organization branding and specific sections, then generating a report that reflects those customizations.

**Acceptance Scenarios**:

1. **Given** I am in template settings, **When** I create a new template, **Then** I can add organization logo, choose color scheme, and select which sections to include from available options (executive summary, technical findings, compliance mapping, remediation timeline, appendices).

2. **Given** I am editing a template, **When** I reorder sections or add custom text blocks, **Then** the changes are reflected in reports generated with that template.

3. **Given** I have created a custom template, **When** other organization members generate reports, **Then** they can select my custom template from the template list.

4. **Given** I want to ensure consistent reporting, **When** I set a template as the organization default, **Then** new report generations use this template unless the user explicitly selects another.

5. **Given** a custom template exists, **When** I delete it, **Then** previously generated reports using that template remain accessible (reports store template snapshot, not reference).

---

### Edge Cases

- What happens when a scan has no findings? The system generates a report with a "clean scan" summary, compliance metrics showing all tested controls passed, and a timestamp for audit documentation.

- How does the system handle report generation for very large scans (1000+ findings)? Reports are generated asynchronously with progress indication. Users receive notification when complete. PDF reports paginate findings with a summary table of contents.

- What happens if email delivery fails for a scheduled report? The system retries delivery twice with exponential backoff. If still failing, it marks the schedule run as "delivery failed", stores the report for manual download, and notifies the schedule owner.

- How does compliance mapping work when a vulnerability maps to multiple controls? The vulnerability appears under each relevant control with a clear indication it's a shared finding to avoid double-counting in metrics.

- What happens when a compliance framework version is updated? Existing reports retain their original framework version. New reports use the updated version. Users see clear version indicators on all compliance mappings.

- How does the system handle expired share links being accessed? Display a clear expiration message with the report title (not contents) and option to request new access from the owner.

- What if a user tries to generate a report while another generation is in progress for the same scan? The system queues the request or returns the in-progress report, preventing duplicate work.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide report templates: Executive Summary, Technical Detail, and Compliance-Focused
- **FR-002**: System MUST generate reports within 30 seconds for scans with fewer than 100 findings
- **FR-003**: System MUST support asynchronous report generation with progress indication for large scans
- **FR-004**: System MUST export reports in PDF, HTML, JSON, and CSV formats
- **FR-005**: System MUST store generated reports for retrieval without regeneration
- **FR-006**: System MUST support compliance framework mapping for OWASP Top 10, PCI-DSS, SOC 2, and CIS Controls
- **FR-007**: System MUST display compliance coverage percentage per framework control category
- **FR-008**: System MUST distinguish between "compliant", "non-compliant", and "not tested" states for controls
- **FR-009**: System MUST maintain compliance framework version history and indicate version on all mappings
- **FR-010**: System MUST enable report sharing via secure time-limited links (default 7 days, configurable); links grant access without requiring recipient authentication (token-based)
- **FR-011**: System MUST log report access including viewer identity and timestamp for audit trails
- **FR-012**: System MUST allow bulk export of multiple scan reports into a combined document
- **FR-013**: System MUST support scheduled report generation (weekly, monthly frequencies)
- **FR-014**: System MUST send scheduled reports to configured email recipients automatically
- **FR-015**: System MUST allow pausing/resuming report schedules without losing configuration
- **FR-016**: System MUST retry failed scheduled report generation once before marking as failed
- **FR-017**: System MUST provide organization-wide compliance dashboard with aggregate metrics
- **FR-018**: System MUST display compliance trend graphs for 30, 60, and 90-day periods
- **FR-019**: System MUST support drill-down from dashboard metrics to specific project findings
- **FR-020**: System MUST allow custom report template creation with logo, colors, and section selection
- **FR-021**: System MUST store template snapshots with generated reports (not live references)
- **FR-022**: System MUST allow setting organization-default report templates
- **FR-023**: System MUST include remediation recommendations with severity-based prioritization in all reports
- **FR-024**: System MUST support adding custom notes/annotations to findings before report generation
- **FR-025**: System MUST watermark shared reports with recipient information for tracking
- **FR-026**: System MUST provide API endpoints for programmatic report generation and retrieval
- **FR-027**: System MUST enforce team-based access control where reports inherit project team permissions and organization admins can view all reports
- **FR-028**: System MUST treat generated reports as immutable; deletion requires organization admin permission and creates an audit log entry
- **FR-029**: System MUST limit concurrent report generations to 5 per organization; additional requests are queued and processed in order

### Key Entities

- **Report**: Generated document containing scan findings analysis, compliance mappings, and recommendations; linked to a scan and template snapshot
- **ReportTemplate**: Defines report structure, branding (logo, colors), included sections, and formatting preferences
- **ComplianceFramework**: Represents a compliance standard (OWASP, PCI-DSS, etc.) with version, control categories, and individual controls
- **ComplianceMapping**: Links a vulnerability type to one or more compliance framework controls with severity weighting
- **ReportShare**: Tracks a shared report instance with recipient, expiration time, access logs, and revocation status
- **ReportSchedule**: Defines automated report generation frequency, template, frameworks, and recipient list
- **ComplianceDashboard**: Aggregated view configuration storing selected frameworks, time ranges, and project filters

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate a report from completed scan within 60 seconds end-to-end
- **SC-002**: 95% of generated reports require no manual corrections before distribution
- **SC-003**: Compliance reports are accepted by auditors without requiring additional documentation (validated through user feedback)
- **SC-004**: Scheduled reports are delivered within 15 minutes of scheduled time 99% of the time
- **SC-005**: Users can find and share a historical report within 30 seconds
- **SC-006**: Compliance dashboard loads with aggregate metrics within 5 seconds
- **SC-007**: 80% of users find the default report templates sufficient without customization (measured via template usage analytics)
- **SC-008**: Report export to any format completes within 10 seconds for reports under 500 findings
- **SC-009**: Organizations achieve 90% compliance coverage visibility across their project portfolio within first month of use

## Clarifications

### Session 2026-01-17

- Q: Who within an organization can view/generate reports for projects they don't own? → A: Team-based access - reports inherit project team permissions; org admins can view all
- Q: Are generated reports immutable or can they be edited/deleted? → A: Immutable - reports cannot be modified after generation; deletion requires admin + audit log
- Q: Must shared link recipients authenticate to view reports? → A: Link-only - secure token in URL is sufficient; no login required (enables external sharing with auditors/clients)
- Q: Should there be limits on simultaneous report generations? → A: Org limit - maximum 5 concurrent report generations per organization; queue additional requests

## Assumptions

- Scan results include sufficient metadata (vulnerability type, severity, affected URLs) for meaningful compliance mapping
- Email infrastructure is available and configured for report distribution
- Users have appropriate permissions within their organization to view/share reports
- Compliance framework control definitions are publicly available and stable (updates less frequent than quarterly)
- Generated reports will be stored in cloud storage with standard retention policies (12 months matching scan retention from Epic 2)
- Organizations have consistent branding assets (logos, color codes) available for custom template creation
- Report recipients have internet access to view shared reports via secure links
