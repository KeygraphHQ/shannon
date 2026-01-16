# Feature Specification: Onboarding & Setup

**Feature Branch**: `001-onboarding-setup`
**Created**: 2026-01-16
**Status**: Draft
**Input**: PRD Epic 1: Onboarding & Setup - User account creation, OAuth authentication, organization management, and team collaboration

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Start First Scan (Priority: P1)

A new user discovers Shannon SaaS and wants to evaluate whether it's worth their time. They should be able to sign up, add a project, and run their first security scan in under 5 minutes with minimal friction. The goal is to demonstrate immediate value before asking for significant investment.

**Why this priority**: This is the critical "aha moment" that determines whether users convert from visitors to active users. Without a frictionless first experience, users will abandon the platform before seeing value. The PRD targets <10 minutes median time-to-first-scan.

**Independent Test**: Can be fully tested by a new user visiting the landing page, completing signup via OAuth, entering a target URL, and viewing scan results - delivers immediate security insights.

**Acceptance Scenarios**:

1. **Given** a visitor on the landing page, **When** they click "Sign up with Google", **Then** they complete OAuth flow and land in the dashboard within 30 seconds.

2. **Given** a visitor on the landing page, **When** they click "Sign up with GitHub", **Then** they complete OAuth flow and land in the dashboard within 30 seconds.

3. **Given** a newly signed-up user on the dashboard, **When** they click "New Scan" and enter only a URL, **Then** a scan starts within 5 seconds without requiring additional configuration.

4. **Given** a running scan, **When** the user views the scan progress page, **Then** they see real-time progress updates (current phase, progress percentage, ETA).

5. **Given** a completed scan with findings, **When** the user views the results, **Then** they see at least a summary of discovered vulnerabilities organized by severity.

6. **Given** a completed scan, **When** the user clicks "Download Report", **Then** a PDF report downloads within 10 seconds.

---

### User Story 2 - Account Creation with Email (Priority: P2)

A user who prefers not to use OAuth providers wants to create an account using their email address and password. They need to verify their email before gaining full access to the platform.

**Why this priority**: While OAuth is the fastest path, some enterprise users or privacy-conscious users prefer traditional email/password authentication. This is a common alternative path that shouldn't block MVP but is expected by users.

**Independent Test**: Can be fully tested by completing the signup form with email/password, receiving verification email, clicking the verification link, and logging in successfully.

**Acceptance Scenarios**:

1. **Given** a visitor on the signup page, **When** they enter email, password (8+ characters with at least 1 number), and submit, **Then** an account is created and a verification email is sent within 5 minutes.

2. **Given** an unverified user, **When** they click the verification link in their email, **Then** their account is marked as verified and they are redirected to the dashboard.

3. **Given** a verified user on the login page, **When** they enter correct credentials, **Then** they are authenticated and redirected to the dashboard.

4. **Given** a user who forgot their password, **When** they click "Forgot password" and enter their email, **Then** a password reset email is sent within 5 minutes.

5. **Given** a user with a password reset email, **When** they click the reset link and enter a new password, **Then** their password is updated and they can log in with the new password.

6. **Given** a logged-in user, **When** they navigate to account settings, **Then** they can update their name, email, and password.

---

### User Story 3 - Organization Management (Priority: P2)

A user needs to create and manage organizations (workspaces) to organize their security testing projects. Users may belong to multiple organizations and need to switch between them easily.

**Why this priority**: Organizations are the foundation of multi-tenancy and team collaboration. Without organizations, users cannot invite team members or properly isolate their projects. This is a prerequisite for Team Collaboration (Story 4).

**Independent Test**: Can be fully tested by creating an organization, naming it, switching between organizations, and deleting an organization.

**Acceptance Scenarios**:

1. **Given** a newly signed-up user, **When** they complete signup, **Then** a default organization is automatically created with their name (e.g., "Diana's Workspace") and they are assigned as Owner.

2. **Given** a user in the dashboard, **When** they click "Create Organization", **Then** they can create a new organization with a name and optional description.

3. **Given** a user belonging to multiple organizations, **When** they click the organization dropdown in the header, **Then** they see a list of all organizations they belong to and can switch between them.

4. **Given** an organization owner, **When** they navigate to organization settings, **Then** they can update the organization name, description, and logo.

5. **Given** an organization owner, **When** they click "Delete Organization" and confirm, **Then** the organization and all associated data (projects, scans, findings) are scheduled for deletion.

6. **Given** a user who is not the owner, **When** they view organization settings, **Then** they cannot see or access delete/billing options.

---

### User Story 4 - Team Collaboration (Priority: P3)

An organization owner or admin wants to invite team members to collaborate on security testing. Team members should have appropriate access levels based on their roles, and all access changes should be logged for audit purposes.

**Why this priority**: Team collaboration enables the viral growth of the product and is essential for enterprise adoption. However, a single user can use the product effectively without team features, making this P3 for MVP.

**Independent Test**: Can be fully tested by sending an invitation, accepting it as a new user, verifying role-based permissions, and removing a team member.

**Acceptance Scenarios**:

1. **Given** an organization owner/admin, **When** they navigate to "Team" and enter an email address with a role, **Then** an invitation email is sent to that address.

2. **Given** a user who received an invitation email, **When** they click the invitation link, **Then** they are prompted to sign up (if new) or sign in (if existing) and are added to the organization with the assigned role.

3. **Given** an organization admin, **When** they view the team page, **Then** they see all members with their roles, join dates, and last active timestamps.

4. **Given** an organization owner, **When** they change a member's role from the team page, **Then** the member's permissions are updated immediately.

5. **Given** an organization owner/admin, **When** they click "Remove" next to a team member, **Then** the member loses access to the organization immediately.

6. **Given** any access change (invite, role change, removal), **When** the action is completed, **Then** an entry is recorded in the audit log with timestamp, actor, action, and target.

7. **Given** a pending invitation, **When** the sender views the team page, **Then** they can see pending invitations and resend if needed.

---

### User Story 5 - Multi-Factor Authentication (Priority: P4)

A security-conscious user wants to enable two-factor authentication (2FA) to protect their account from unauthorized access. Enterprise plans may require 2FA for all members.

**Why this priority**: While important for security, 2FA is not required for basic platform usage. Most users will not enable it immediately during onboarding. This is a "nice-to-have" for MVP that can follow the core flows.

**Independent Test**: Can be fully tested by enabling 2FA in settings, scanning QR code, entering TOTP code, and verifying login requires 2FA.

**Acceptance Scenarios**:

1. **Given** a logged-in user in security settings, **When** they click "Enable 2FA", **Then** they see a QR code and a text secret they can add to their authenticator app.

2. **Given** a user setting up 2FA, **When** they enter a valid TOTP code from their authenticator app, **Then** 2FA is enabled and they receive 10 recovery codes.

3. **Given** a user with 2FA enabled, **When** they log in with correct password, **Then** they are prompted to enter their TOTP code before accessing the dashboard.

4. **Given** a user who lost access to their authenticator, **When** they use a recovery code during login, **Then** they gain access and that recovery code is invalidated.

5. **Given** a user with 2FA enabled, **When** they navigate to security settings and click "Disable 2FA", **Then** they must confirm with their current TOTP code and 2FA is disabled.

---

### Edge Cases

- **Expired invitation links**: Invitation links expire after 7 days. Users clicking expired links see an error message with option to request a new invitation.
- **OAuth account without email permission**: If OAuth provider doesn't share email, user is prompted to enter email manually after OAuth.
- **OAuth provider unavailable**: If Google/GitHub OAuth service is down, show error message with prompt to use email/password signup as fallback.
- **Duplicate email signup**: Attempting to sign up with an email already in use shows an error with option to log in or reset password.
- **Organization deletion with active members**: Owner must remove all other members before deleting an organization, or confirm they understand all members will lose access.
- **Self-removal from organization**: Users cannot remove themselves if they are the only owner. They must transfer ownership first.
- **Invalid TOTP codes**: After 5 failed TOTP attempts, account is temporarily locked for 15 minutes.
- **Failed login attempts**: After 5 failed password attempts, account is temporarily locked for 15 minutes (consistent with 2FA lockout policy).
- **Concurrent sessions**: Users can have multiple active sessions. Changing password invalidates all other sessions.
- **Email change verification**: Changing email requires verification of the new email address before the change takes effect.
- **Plan downgrade with excess members**: If an organization has more members than the target plan allows (e.g., Pro with 5 members → Free), the downgrade is blocked until the owner removes excess members.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication:**
- **FR-001**: System MUST allow users to sign up using Google OAuth 2.0 with email scope.
- **FR-002**: System MUST allow users to sign up using GitHub OAuth with email scope.
- **FR-003**: System MUST allow users to sign up using email and password (minimum 8 characters, at least 1 number).
- **FR-004**: System MUST send email verification links that expire after 24 hours.
- **FR-004a**: System MUST block unverified users from accessing the dashboard until email is verified (display verification pending screen with resend option).
- **FR-005**: System MUST provide password reset functionality via secure time-limited tokens (1 hour expiration).
- **FR-006**: System MUST support TOTP-based two-factor authentication with standard authenticator apps.
- **FR-007**: System MUST generate 10 single-use recovery codes when 2FA is enabled.
- **FR-008**: System MUST maintain user sessions that persist across browser restarts (15-day default expiration).
- **FR-009**: System MUST allow users to delete their account and all associated data (GDPR compliance).

**Organization Management:**
- **FR-010**: System MUST automatically create a default organization when a user signs up.
- **FR-011**: System MUST allow users to create unlimited additional organizations.
- **FR-012**: System MUST allow users to switch between organizations they belong to.
- **FR-013**: System MUST support organization-level settings including name, description, and logo.
- **FR-014**: System MUST schedule organization deletion (30-day soft delete with recovery option, then hard delete).

**Team Management:**
- **FR-015**: System MUST allow sending email invitations to join an organization.
- **FR-015a**: System MUST enforce team member limits by plan: Free (1 member - owner only), Pro (5 members), Enterprise (unlimited). Invitations beyond the limit are blocked with an upgrade prompt.
- **FR-016**: System MUST support four roles: Owner (full control), Admin (cannot manage billing), Member (cannot invite users), Viewer (read-only).
- **FR-017**: System MUST track pending invitations and allow resending.
- **FR-018**: System MUST allow owners/admins to change member roles.
- **FR-019**: System MUST allow owners/admins to remove members with immediate access revocation.
- **FR-020**: System MUST prevent the last owner from leaving or being removed without transferring ownership.

**Audit & Security:**
- **FR-021**: System MUST log all access-related events (login, logout, role changes, invitations, removals) with timestamp, actor, and IP address.
- **FR-022**: System MUST enforce role-based access control on all organization resources.
- **FR-023**: System MUST isolate data between organizations (users cannot access data from organizations they don't belong to).

### Key Entities

- **User**: Represents an individual account holder. Key attributes: email (unique), name, avatar, password hash (optional for OAuth), 2FA status, created date, verified status.

- **Organization**: Represents a workspace/tenant. Key attributes: name, slug (unique URL identifier), description, logo, plan type, created date, owner reference.

- **OrganizationMembership**: Links users to organizations with roles. Key attributes: user reference, organization reference, role (owner/admin/member/viewer), joined date, invited by.

- **Invitation**: Represents a pending team invitation. Key attributes: email, organization reference, role, invited by, created date, expires date, accepted status.

- **AuditLog**: Records security-relevant events. Key attributes: organization reference, actor (user), action type, target (user/resource), metadata, timestamp, IP address.

- **Session**: Represents an active user session. Key attributes: user reference, device info, IP address, created date, last active, expires date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 80% of new users complete their first scan within 10 minutes of landing on the site (Time-to-Value).

- **SC-002**: OAuth signup flow completes in under 30 seconds from click to dashboard (Signup Speed).

- **SC-003**: Email verification emails are delivered within 5 minutes of signup (Email Delivery).

- **SC-004**: 95% of password reset requests result in successful password changes (Reset Completion Rate).

- **SC-005**: Users can switch between organizations in under 2 seconds (Organization Switching).

- **SC-006**: Team invitation acceptance rate exceeds 60% within 7 days of sending (Invitation Conversion).

- **SC-007**: Zero unauthorized cross-organization data access incidents (Security - Critical).

- **SC-008**: Less than 1% of signup attempts result in errors (Signup Reliability).

- **SC-009**: 100% of access-related events are captured in audit logs (Audit Completeness).

- **SC-010**: Users with 2FA enabled experience less than 5% login failure rate due to TOTP issues (2FA Usability).

## Clarifications

### Session 2026-01-16

- Q: What access do unverified users have after email/password signup? → A: Blocked completely - must verify email before accessing dashboard.
- Q: What are the team member limits per organization? → A: Free: 1 member, Pro: 5 members, Enterprise: unlimited.
- Q: What rate limiting applies to failed login attempts? → A: 5 failed attempts → 15-minute account lockout (matches 2FA behavior).
- Q: What happens when OAuth provider (Google/GitHub) is unavailable? → A: Show error with prompt to use email/password signup as fallback.
- Q: What happens when an organization downgrades and has more members than allowed? → A: Block downgrade until owner manually removes excess members.

## Assumptions

The following assumptions were made based on industry standards and PRD context:

1. **Session duration**: 15-day session expiration is standard for SaaS applications balancing security and convenience.

2. **Invitation expiration**: 7-day invitation expiration is industry standard, long enough for users to act but short enough for security.

3. **Password requirements**: 8+ characters with at least 1 number meets NIST guidelines without excessive friction.

4. **Recovery codes**: 10 recovery codes is standard practice (Google, GitHub, etc. use similar numbers).

5. **Soft delete period**: 30-day soft delete for organizations allows data recovery while meeting GDPR deletion requirements.

6. **Account lockout**: 15-minute lockout after 5 failed 2FA attempts balances security with usability.

7. **OAuth providers**: Google and GitHub are the most commonly used OAuth providers for developer-focused SaaS tools.
