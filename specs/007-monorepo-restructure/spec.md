# Feature Specification: Monorepo Restructure with GhostShell

**Feature Branch**: `007-monorepo-restructure`
**Created**: 2025-01-18
**Status**: Draft
**Input**: User description: "Rename the web service to GhostShell (including the database; redesign the structure). Plan the folder organization so that the core, Shannon, is isolated in a root-level folder, just like GhostShell. The structure will be a monorepo, with each system in its own isolated folder."

## Clarifications

### Session 2025-01-18

- Q: Where should the Shannon HTTP API service (`src/service/`) be located? → A: Keep in Shannon - API is part of the pentest engine, GhostShell calls it as a consumer.
- Q: What should happen to root-level configuration files? → A: Minimal root - keep orchestration files (docker-compose, workspace config, CLI) at root only; each package manages its own build configs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Works on Shannon Core (Priority: P1)

A developer wants to work exclusively on the Shannon penetration testing engine without needing to understand or build the GhostShell web application. They navigate to the `shannon/` directory, install dependencies, and run tests independently.

**Why this priority**: This is the foundational isolation that enables independent development. Without proper separation, developers cannot work on one system without coupling to the other.

**Independent Test**: Can be fully tested by running `npm install` and `npm run build` within the `shannon/` directory without any reference to GhostShell.

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository, **When** a developer runs `cd shannon && npm install && npm run build`, **Then** Shannon builds successfully without requiring GhostShell dependencies
2. **Given** the Shannon directory, **When** a developer runs the pentest workflow, **Then** all existing functionality works identically to before the restructure
3. **Given** changes only in the `shannon/` directory, **When** the developer commits, **Then** only Shannon-related files are affected

---

### User Story 2 - Developer Works on GhostShell Web Application (Priority: P1)

A developer wants to work on the GhostShell web frontend without needing the full Shannon engine running. They navigate to the `ghostshell/` directory and can develop, test, and run the web application independently.

**Why this priority**: Equal priority to Shannon isolation - both systems must be independently workable for the monorepo structure to succeed.

**Independent Test**: Can be fully tested by running `npm install` and `npm run dev` within the `ghostshell/` directory.

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository, **When** a developer runs `cd ghostshell && npm install && npm run dev`, **Then** GhostShell starts successfully without requiring Shannon to be running
2. **Given** the GhostShell directory, **When** the database migrations run, **Then** they create tables in the `ghostshell` database (not `shannon`)
3. **Given** only GhostShell changes, **When** deployed independently, **Then** the web application functions for users viewing reports and managing configurations

---

### User Story 3 - Full System Deployment (Priority: P2)

An operator wants to deploy the complete system including both Shannon (pentest engine) and GhostShell (web interface). They use a root-level orchestration to start all services together.

**Why this priority**: Integration is important but secondary to individual system isolation being correct first.

**Independent Test**: Can be tested by running a root-level docker-compose or orchestration command that brings up all services.

**Acceptance Scenarios**:

1. **Given** the repository root, **When** operator runs the orchestration command, **Then** both Shannon and GhostShell services start and can communicate
2. **Given** both systems running, **When** Shannon completes a pentest, **Then** GhostShell can display the results through its web interface
3. **Given** an existing deployment, **When** only GhostShell is updated, **Then** it can be redeployed without affecting running Shannon workflows

---

### User Story 4 - Database Rename Migration (Priority: P2)

A database administrator needs to migrate from the existing `shannon` database to the new `ghostshell` database for the web application data.

**Why this priority**: Database migration is a one-time operation but critical for the rename to be complete.

**Independent Test**: Can be tested by running migration scripts that move data from `shannon` to `ghostshell` database.

**Acceptance Scenarios**:

1. **Given** existing data in the `shannon` database, **When** migration runs, **Then** all data is preserved in the `ghostshell` database
2. **Given** the migration is complete, **When** GhostShell connects to the database, **Then** it uses `ghostshell` as the database name
3. **Given** the renamed database, **When** examining database references, **Then** no references to the old database name remain in configuration files

---

### Edge Cases

- What happens when a developer has both old and new database running?
  - Clear documentation should indicate the old database is deprecated and provide cleanup instructions
- How does the system handle shared dependencies between Shannon and GhostShell?
  - Each system maintains its own `node_modules`; shared types can be extracted to a `shared/` package if needed later
- What happens to existing CI/CD pipelines during the transition?
  - Pipeline configurations must be updated to reflect new paths; existing workflows should fail gracefully with clear error messages

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Repository MUST be organized as a monorepo with `shannon/` and `ghostshell/` as isolated root-level directories
- **FR-002**: Shannon core MUST be fully contained within the `shannon/` directory including all source code, prompts, configurations, Temporal workflows, and the HTTP API service layer
- **FR-003**: GhostShell web application MUST be fully contained within the `ghostshell/` directory including all frontend components, API routes, and web-specific code
- **FR-004**: Each system MUST have its own independent `package.json` with isolated dependencies
- **FR-005**: Each system MUST be buildable, testable, and runnable without requiring the other system
- **FR-006**: Database for the web application MUST be renamed from `shannon` to `ghostshell`
- **FR-007**: All database connection strings and environment variables MUST reference `ghostshell` database name
- **FR-008**: Root-level orchestration MUST exist to run both systems together (docker-compose, workspace config, CLI script)
- **FR-008a**: Root level MUST contain only orchestration files; build configs (tsconfig, package.json for builds) MUST reside in respective packages
- **FR-009**: Shared configuration files (e.g., `.env.example`) MUST be updated to reflect the new structure
- **FR-010**: Documentation (README, CLAUDE.md) MUST be updated to reflect the new monorepo structure and system names

### Key Entities

- **Shannon**: The AI-powered penetration testing engine including Temporal workflows, Claude Agent SDK integration, prompt templates, and security scanning capabilities
- **GhostShell**: The web application providing user interface for managing pentests, viewing reports, configuring authentication, and compliance tracking (renamed from generic "web")
- **Monorepo Root**: The repository root containing orchestration files, shared documentation, and development tooling that spans both systems

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developer can clone repository and build Shannon in isolation without touching GhostShell
- **SC-002**: Developer can clone repository and start GhostShell development server without building Shannon
- **SC-003**: All existing pentest workflows complete successfully after restructure with identical output
- **SC-004**: All existing GhostShell web functionality works identically after rename and restructure
- **SC-005**: Zero references to old database name (`shannon`) remain in GhostShell configuration or code
- **SC-006**: Both systems can be deployed together using a single root-level command
- **SC-007**: Directory structure is immediately clear to new contributors (each system's purpose is obvious from folder names)

## Assumptions

- The current `web/` directory contains all web application code and will become `ghostshell/`
- The current root-level `src/`, `prompts/`, `configs/`, and related directories belong to Shannon core
- No shared code packages are needed initially; if identified later, a `shared/` or `packages/` directory can be added
- Existing Docker configurations will be updated rather than creating new ones from scratch
- CI/CD pipeline updates are out of scope for this specification (separate concern)
- Database schema remains unchanged; only the database name changes
