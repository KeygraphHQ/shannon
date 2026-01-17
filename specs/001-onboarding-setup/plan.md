# Implementation Plan: Onboarding & Setup

**Branch**: `001-onboarding-setup` | **Date**: 2026-01-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-onboarding-setup/spec.md`
**Status**: COMPLETE (Retrospective Documentation)

## Summary

Implemented user authentication (OAuth via Google/GitHub + email/password), organization management with multi-tenancy, team collaboration with role-based access control, and optional TOTP-based two-factor authentication. The implementation uses Clerk for authentication, Prisma for data persistence, and Next.js App Router for the web interface.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ runtime)
**Primary Dependencies**:
- **Framework**: Next.js 16 with App Router
- **Auth**: Clerk (OAuth, email/password, 2FA)
- **Database**: Prisma 7.2 ORM with PostgreSQL
- **UI**: React 19, Tailwind CSS 4, Lucide React icons
- **Validation**: Zod v4.3.5

**Storage**: PostgreSQL via Prisma ORM with @prisma/adapter-pg
**Testing**: Manual testing (no automated test framework configured)
**Target Platform**: Web SaaS (Vercel-ready Next.js deployment)
**Project Type**: Web application (Next.js App Router)

**Performance Goals**:
- OAuth signup <30 seconds (SC-002)
- Organization switching <2 seconds (SC-005)
- Email delivery <5 minutes (SC-003)

**Constraints**:
- 15-day session expiration
- 7-day invitation expiration
- 30-day soft delete for organizations
- Team limits by plan: Free (1), Pro (5), Enterprise (unlimited)

**Scale/Scope**: Multi-tenant SaaS with organization-scoped data isolation

## Constitution Check

*Retrospective verification - all principles satisfied by implementation.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Security-First | ✅ PASS | Clerk handles auth securely, RBAC implemented, audit logging for all access events |
| II. AI-Native Architecture | ✅ PASS | N/A - This epic is user management, not AI execution |
| III. Multi-Tenant Isolation | ✅ PASS | All queries scoped by organizationId, RLS via Prisma middleware |
| IV. Temporal-First Orchestration | ✅ PASS | N/A - No long-running workflows; CRUD operations only |
| V. Progressive Delivery | ✅ PASS | 5 prioritized user stories (P1-P4), each independently implemented and tested |
| VI. Observability-Driven | ✅ PASS | Audit logging for all auth/access events in web/lib/audit.ts |
| VII. Simplicity | ✅ PASS | Leveraged Clerk for auth complexity, minimal custom code |

**Gate Result**: PASS - All constitutional principles satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/001-onboarding-setup/
├── plan.md              # This file (retrospective)
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Requirements checklist
└── tasks.md             # Implementation tasks (all complete)
```

### Source Code (repository root)

```text
web/
├── app/
│   ├── (auth)/                      # Auth routes
│   │   ├── sign-in/[[...sign-in]]/  # Clerk sign-in
│   │   ├── sign-up/[[...sign-up]]/  # Clerk sign-up
│   │   ├── verify-email/            # Email verification
│   │   ├── forgot-password/         # Password reset
│   │   ├── verify-2fa/              # 2FA verification
│   │   └── use-recovery-code/       # Recovery code flow
│   ├── (dashboard)/                 # Protected dashboard
│   │   ├── layout.tsx               # Dashboard layout with nav
│   │   ├── page.tsx                 # Dashboard home
│   │   ├── settings/
│   │   │   ├── account/             # Profile settings
│   │   │   └── security/            # Password, 2FA settings
│   │   └── org/[orgId]/
│   │       ├── settings/            # Org settings
│   │       ├── team/                # Team management
│   │       └── audit/               # Audit log viewer
│   ├── accept-invite/[token]/       # Invitation acceptance
│   └── api/
│       └── webhooks/clerk/          # Clerk webhook handler
├── components/
│   ├── org-switcher.tsx             # Organization dropdown
│   ├── new-org-modal.tsx            # Create organization
│   ├── delete-org-modal.tsx         # Delete confirmation
│   ├── org-logo-upload.tsx          # Logo upload
│   ├── invite-member-modal.tsx      # Team invitations
│   ├── team-member-list.tsx         # Member list
│   ├── change-role-dialog.tsx       # Role management
│   ├── remove-member-dialog.tsx     # Remove member
│   ├── pending-invitations.tsx      # Pending invites
│   ├── enable-2fa.tsx               # 2FA setup
│   ├── disable-2fa.tsx              # 2FA disable
│   ├── recovery-codes-download.tsx  # Recovery codes
│   ├── dashboard-nav.tsx            # Navigation
│   ├── toast-provider.tsx           # Notifications
│   └── onboarding-tour.tsx          # User onboarding
├── lib/
│   ├── actions/
│   │   ├── users.ts                 # User server actions
│   │   ├── organizations.ts         # Org server actions
│   │   ├── invitations.ts           # Invitation actions
│   │   ├── memberships.ts           # Membership actions
│   │   └── two-factor.ts            # 2FA actions
│   ├── auth.ts                      # Auth utilities
│   ├── audit.ts                     # Audit logging
│   ├── db.ts                        # Prisma client
│   ├── email.ts                     # Email sending
│   ├── security.ts                  # Rate limiting, lockout
│   ├── organization-context.tsx     # Org context provider
│   ├── analytics.ts                 # User analytics
│   ├── logger.ts                    # Structured logging
│   ├── validations/                 # Zod schemas
│   ├── email-templates/             # Transactional emails
│   └── jobs/
│       └── clean-expired-invitations.ts
├── middleware.ts                    # Route protection
└── prisma/
    └── schema.prisma                # User, Org, Membership models
```

**Structure Decision**: Web application pattern using Next.js App Router. Clerk handles authentication complexity (OAuth, email verification, 2FA). Server actions in `lib/actions/` for all mutations. Organization context provider for multi-tenant state management.

## Complexity Tracking

> No violations - implementation followed simplicity principle.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Authentication | Clerk (managed) | Constitution VII - avoid reinventing auth |
| Session management | Clerk sessions | 15-day expiration handled by Clerk |
| 2FA | Clerk TOTP | Native Clerk feature, no custom implementation |
| Audit logging | Custom service | Simple append-only logging in web/lib/audit.ts |

## Implementation Summary

### Completed Phases

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Setup | 8 tasks | ✅ Complete |
| Phase 2: Foundational | 8 tasks | ✅ Complete |
| Phase 3: US1 - Quick Start First Scan | 13 tasks | ✅ Complete |
| Phase 4: US2 - Email Account Creation | 10 tasks | ✅ Complete |
| Phase 5: US3 - Organization Management | 11 tasks | ✅ Complete |
| Phase 6: US4 - Team Collaboration | 17 tasks | ✅ Complete |
| Phase 7: US5 - Multi-Factor Authentication | 12 tasks | ✅ Complete |
| Phase 8: Polish | 17 tasks | ✅ Complete |
| **Total** | **88 tasks** | **✅ All Complete** |

### Key Implementation Decisions

1. **Clerk for Authentication**: Eliminated need for custom OAuth, email verification, password reset, and 2FA implementations. Reduced security risk and development time.

2. **Server Actions for Mutations**: All data mutations use Next.js server actions with `"use server"` directive, providing type-safe RPC with automatic revalidation.

3. **Organization Context Provider**: Client-side context provider manages current organization state, stored in cookie for persistence across page loads.

4. **Audit Logging Service**: Simple audit service logs all security-relevant events (login, logout, role changes, invitations) with timestamp, actor, action, target, and IP address.

5. **Soft Delete for Organizations**: 30-day retention before permanent deletion, allowing recovery of accidentally deleted organizations.

## Lessons Learned

1. **Clerk Webhooks**: Required for syncing Clerk user creation with database User records and auto-creating default organizations.

2. **Role-Based Access**: Four-tier RBAC (Owner, Admin, Member, Viewer) implemented via OrganizationMembership model with role field.

3. **Invitation Flow**: Email invitations with 7-day expiration. Existing users can accept immediately; new users directed to signup first.

4. **Plan Limits**: Team member limits enforced at invitation time, not membership creation, to prevent race conditions.
