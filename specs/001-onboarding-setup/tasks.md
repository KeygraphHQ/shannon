# Tasks: Onboarding & Setup

**Input**: Design documents from `/specs/001-onboarding-setup/`
**Prerequisites**: spec.md (user stories), plan.md (technical context)

**Tests**: Tests are OPTIONAL and not included in this task list as they were not explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a Next.js web application with the following structure:
- **Frontend**: `web/app/` (Next.js App Router), `web/components/`
- **Backend Logic**: `web/lib/` (server actions, utilities)
- **Database**: `web/prisma/` (Prisma schema and migrations)
- **API Routes**: `web/app/api/` (webhooks and API endpoints)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure - ALREADY COMPLETE

✅ Project structure created
✅ Next.js 16 initialized with TypeScript, Tailwind CSS 4
✅ Clerk authentication configured
✅ Prisma ORM set up with PostgreSQL
✅ Initial database schema created

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 Apply initial Prisma migration to create database schema in web/prisma/migrations/
- [X] T002 [P] Configure Clerk webhook handling in web/app/api/webhooks/clerk/route.ts
- [X] T003 [P] Implement audit logging service in web/lib/audit.ts
- [X] T004 [P] Create authentication helper utilities in web/lib/auth.ts
- [X] T005 [P] Set up Prisma client singleton in web/lib/db.ts
- [X] T006 Configure Next.js middleware for route protection in web/middleware.ts
- [X] T007 [P] Create base dashboard layout with navigation in web/app/(dashboard)/layout.tsx
- [X] T008 [P] Implement organization context provider in web/lib/organization-context.tsx

**Checkpoint**: ✅ Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Quick Start First Scan (Priority: P1) 🎯 MVP

**Goal**: Enable new users to sign up via OAuth (Google/GitHub), land in dashboard, create a project, and start a security scan in under 5 minutes.

**Independent Test**: New user visits landing page → clicks "Sign up with Google" or "Sign up with GitHub" → completes OAuth → lands in dashboard → clicks "New Scan" → enters URL → sees scan progress → views results → downloads report.

### Implementation for User Story 1

- [X] T009 [P] [US1] Create landing page with OAuth signup buttons in web/app/page.tsx
- [X] T010 [P] [US1] Implement sign-in page with Clerk OAuth in web/app/(auth)/sign-in/[[...sign-in]]/page.tsx
- [X] T011 [P] [US1] Implement sign-up page with Clerk OAuth in web/app/(auth)/sign-up/[[...sign-up]]/page.tsx
- [X] T012 [US1] Create default organization on user signup via Clerk webhook in web/app/api/webhooks/clerk/route.ts
- [X] T013 [P] [US1] Build dashboard home page showing scans list in web/app/(dashboard)/page.tsx
- [X] T014 [P] [US1] Create "New Scan" modal component in web/components/new-scan-modal.tsx
- [X] T015 [US1] Implement server action to create scan in web/lib/actions/scans.ts
- [X] T016 [P] [US1] Create scan progress page with real-time updates in web/app/(dashboard)/scans/[scanId]/page.tsx
- [X] T017 [P] [US1] Create scan results summary page (integrated with progress page) in web/app/(dashboard)/scans/[scanId]/page.tsx
- [X] T018 [US1] Implement PDF report generation endpoint (stub) in web/app/api/scans/[scanId]/report/route.ts
- [X] T019 [US1] Add real-time scan progress tracking (stub for Temporal integration) in web/lib/temporal-client.ts
- [X] T020 [US1] Create vulnerability severity badge component in web/components/severity-badge.tsx
- [X] T021 [US1] Implement audit logging for scan creation and completion in web/lib/actions/scans.ts

**Checkpoint**: ✅ User Story 1 is fully functional - users can sign up, create scans, and view results independently

---

## Phase 4: User Story 2 - Account Creation with Email (Priority: P2)

**Goal**: Allow users to create accounts using email/password with email verification, password reset, and account settings management.

**Independent Test**: User visits signup page → enters email and password → receives verification email → clicks link → logs in → updates profile in settings → resets password via "Forgot password" flow.

### Implementation for User Story 2

- [ ] T022 [P] [US2] Enable Clerk email/password authentication in Clerk dashboard settings
- [ ] T023 [P] [US2] Update sign-up page to include email/password form in web/app/(auth)/sign-up/[[...sign-up]]/page.tsx
- [ ] T024 [P] [US2] Update sign-in page to include email/password form in web/app/(auth)/sign-in/[[...sign-in]]/page.tsx
- [ ] T025 [P] [US2] Create email verification pending page in web/app/(auth)/verify-email/page.tsx
- [ ] T026 [P] [US2] Implement account settings page with profile editing in web/app/(dashboard)/settings/page.tsx
- [ ] T027 [US2] Create server action for updating user profile in web/lib/actions/users.ts
- [ ] T028 [P] [US2] Add password change functionality in web/app/(dashboard)/settings/security/page.tsx
- [ ] T029 [US2] Implement "Forgot password" flow using Clerk's password reset in web/app/(auth)/forgot-password/page.tsx
- [ ] T030 [US2] Add session management and logout functionality in web/components/dashboard-nav.tsx
- [ ] T031 [US2] Implement audit logging for authentication events (login, logout, password change) in web/lib/audit.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - OAuth and email/password auth are both functional

---

## Phase 5: User Story 3 - Organization Management (Priority: P2)

**Goal**: Enable users to create multiple organizations, switch between them, manage organization settings, and delete organizations.

**Independent Test**: User creates new organization → switches between organizations → updates organization settings → deletes test organization.

### Implementation for User Story 3

- [ ] T032 [P] [US3] Create organization switcher dropdown component in web/components/org-switcher.tsx
- [ ] T033 [P] [US3] Implement server action to create organization in web/lib/actions/organizations.ts
- [ ] T034 [P] [US3] Create "New Organization" modal component in web/components/new-org-modal.tsx
- [ ] T035 [US3] Implement organization switching logic with cookie-based state in web/lib/actions/organizations.ts
- [ ] T036 [P] [US3] Create organization settings page in web/app/(dashboard)/org/[orgId]/settings/page.tsx
- [ ] T037 [US3] Implement server action to update organization details in web/lib/actions/organizations.ts
- [ ] T038 [P] [US3] Add organization logo upload functionality in web/components/org-logo-upload.tsx
- [ ] T039 [US3] Implement organization deletion with 30-day soft delete in web/lib/actions/organizations.ts
- [ ] T040 [US3] Create organization deletion confirmation modal in web/components/delete-org-modal.tsx
- [ ] T041 [US3] Add role-based access control checks for organization settings in web/lib/auth.ts
- [ ] T042 [US3] Implement audit logging for organization events (create, update, delete, switch) in web/lib/audit.ts

**Checkpoint**: All organization management features should be fully functional and independently testable

---

## Phase 6: User Story 4 - Team Collaboration (Priority: P3)

**Goal**: Enable organization owners/admins to invite team members, manage roles, and track team activity with audit logging.

**Independent Test**: Owner sends invitation → new user accepts invitation → owner changes member role → owner views audit log → owner removes member.

### Implementation for User Story 4

- [ ] T043 [P] [US4] Create team management page in web/app/(dashboard)/org/[orgId]/team/page.tsx
- [ ] T044 [P] [US4] Implement invite member modal component in web/components/invite-member-modal.tsx
- [ ] T045 [US4] Create server action to send team invitation in web/lib/actions/invitations.ts
- [ ] T046 [P] [US4] Implement invitation email template and sending logic in web/lib/email.ts
- [ ] T047 [P] [US4] Create invitation acceptance page in web/app/accept-invite/[token]/page.tsx
- [ ] T048 [US4] Implement server action to accept invitation in web/lib/actions/invitations.ts
- [ ] T049 [P] [US4] Add team member list with roles and last active in web/components/team-member-list.tsx
- [ ] T050 [US4] Implement server action to change member role in web/lib/actions/memberships.ts
- [ ] T051 [P] [US4] Create role change confirmation dialog in web/components/change-role-dialog.tsx
- [ ] T052 [US4] Implement server action to remove team member in web/lib/actions/memberships.ts
- [ ] T053 [P] [US4] Add member removal confirmation dialog in web/components/remove-member-dialog.tsx
- [ ] T054 [P] [US4] Display pending invitations with resend option in web/components/pending-invitations.tsx
- [ ] T055 [US4] Implement invitation expiration (7 days) and cleanup job in web/lib/jobs/clean-expired-invitations.ts
- [ ] T056 [P] [US4] Enforce team member limits by plan (Free: 1, Pro: 5, Enterprise: unlimited) in web/lib/actions/invitations.ts
- [ ] T057 [P] [US4] Create audit log viewer page in web/app/(dashboard)/org/[orgId]/audit/page.tsx
- [ ] T058 [US4] Implement comprehensive audit logging for all team events in web/lib/audit.ts
- [ ] T059 [US4] Add last owner protection (prevent removal/demotion of last owner) in web/lib/actions/memberships.ts

**Checkpoint**: Team collaboration should be fully functional with complete audit trail

---

## Phase 7: User Story 5 - Multi-Factor Authentication (Priority: P4)

**Goal**: Allow security-conscious users to enable TOTP-based 2FA with recovery codes, and enterprise plans to enforce 2FA for all members.

**Independent Test**: User enables 2FA → scans QR code → enters TOTP code → logs out → logs back in with 2FA → uses recovery code → disables 2FA.

### Implementation for User Story 5

- [ ] T060 [P] [US5] Enable Clerk TOTP 2FA in Clerk dashboard settings
- [ ] T061 [P] [US5] Create 2FA settings page in web/app/(dashboard)/settings/security/two-factor/page.tsx
- [ ] T062 [P] [US5] Implement 2FA enable flow with QR code in web/components/enable-2fa.tsx
- [ ] T063 [US5] Generate and display 10 recovery codes on 2FA enable in web/lib/actions/two-factor.ts
- [ ] T064 [P] [US5] Create recovery codes download component in web/components/recovery-codes-download.tsx
- [ ] T065 [P] [US5] Implement 2FA verification during login using Clerk in web/app/(auth)/verify-2fa/page.tsx
- [ ] T066 [P] [US5] Add recovery code usage flow in web/app/(auth)/use-recovery-code/page.tsx
- [ ] T067 [US5] Implement 2FA disable flow with TOTP confirmation in web/components/disable-2fa.tsx
- [ ] T068 [US5] Add account lockout after 5 failed 2FA attempts (15 minutes) in web/lib/security.ts
- [ ] T069 [P] [US5] Create 2FA status indicator in user profile dropdown in web/components/dashboard-nav.tsx
- [ ] T070 [US5] Implement organization-level 2FA enforcement for Enterprise plans in web/lib/actions/organizations.ts
- [ ] T071 [US5] Implement audit logging for 2FA events (enable, disable, lockout, recovery code use) in web/lib/audit.ts

**Checkpoint**: All 2FA features should be fully functional with proper security measures

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T072 [P] Add comprehensive error handling and user-friendly error messages across all pages
- [ ] T073 [P] Implement loading states and skeletons for all async operations in web/components/ui/
- [ ] T074 [P] Add toast notifications for success/error feedback in web/components/toast-provider.tsx
- [ ] T075 [P] Optimize database queries with proper indexing in web/prisma/schema.prisma
- [ ] T076 [P] Add input validation and sanitization across all forms using Zod in web/lib/validations/
- [ ] T077 [P] Implement rate limiting for sensitive endpoints in web/middleware.ts
- [ ] T078 [P] Add analytics tracking for key user actions in web/lib/analytics.ts
- [ ] T079 [P] Create user onboarding tour component in web/components/onboarding-tour.tsx
- [ ] T080 [P] Add accessibility improvements (ARIA labels, keyboard navigation) across all components
- [ ] T081 [P] Optimize images and implement lazy loading in web/components/optimized-image.tsx
- [ ] T082 [P] Add comprehensive logging for debugging in web/lib/logger.ts
- [ ] T083 [P] Implement GDPR-compliant account deletion in web/lib/actions/users.ts
- [ ] T084 [P] Create email templates for all transactional emails in web/lib/email-templates/
- [ ] T085 [P] Add security headers and CSP policies in web/next.config.ts
- [ ] T086 Code cleanup and refactoring for consistency
- [ ] T087 [P] Update README with setup instructions in web/README.md
- [ ] T088 Performance testing and optimization across all user journeys

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ COMPLETE - project structure and dependencies set up
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent from US1
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent from US1/US2
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - May reference US3 organizations but independently testable
- **User Story 5 (P4)**: Can start after Foundational (Phase 2) - Independent from all other stories

### Within Each User Story

- Models/schema updates before services
- Services before UI components
- Server actions before client components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Foundational tasks marked [P] can run in parallel (T002, T003, T004, T005, T007, T008)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Within each user story, all tasks marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# After Foundational phase is complete, launch these US1 tasks in parallel:
Task T009: "Create landing page with OAuth signup buttons"
Task T010: "Implement sign-in page with Clerk OAuth"
Task T011: "Implement sign-up page with Clerk OAuth"
Task T013: "Build dashboard home page showing projects list"
Task T014: "Create New Scan modal component"
Task T016: "Create scan progress page with real-time updates"
Task T017: "Create scan results summary page"
Task T020: "Create vulnerability severity badge component"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
2. Complete Phase 3: User Story 1 (Quick Start First Scan)
3. **STOP and VALIDATE**: Test User Story 1 independently
4. Deploy/demo MVP with core scanning functionality

### Incremental Delivery

1. Complete Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (Email auth alternative)
4. Add User Story 3 → Test independently → Deploy/Demo (Multi-tenancy)
5. Add User Story 4 → Test independently → Deploy/Demo (Team collaboration)
6. Add User Story 5 → Test independently → Deploy/Demo (Enhanced security)
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (P1)
   - Developer B: User Story 2 (P2)
   - Developer C: User Story 3 (P2)
3. After P1-P2 complete:
   - Developer A: User Story 4 (P3)
   - Developer B: User Story 5 (P4)
   - Developer C: Polish tasks
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tests are OPTIONAL and not included as they weren't explicitly requested
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Clerk handles most authentication complexity (OAuth, email, 2FA)
- Prisma handles database migrations and type safety
- Next.js App Router enables server-side rendering and server actions
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
