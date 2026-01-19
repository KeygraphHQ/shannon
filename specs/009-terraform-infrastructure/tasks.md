# Tasks: Terraform Infrastructure Deployment

**Input**: Design documents from `/specs/009-terraform-infrastructure/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in specification. Using Terraform native validation (validate, fmt, plan).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Include exact file paths in descriptions

## Path Conventions

All paths relative to repository root under `infrastructure/`:

```
infrastructure/
├── modules/           # Reusable Terraform modules
├── environments/      # Environment-specific configurations
├── bootstrap/         # State backend setup
└── README.md          # Documentation
```

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create project structure and configure Terraform tooling

- [x] T001 Create infrastructure directory structure per plan.md in infrastructure/
- [x] T002 [P] Create .terraform-version file with version constraint in infrastructure/.terraform-version
- [x] T003 [P] Create TFLint configuration in infrastructure/.tflint.hcl
- [x] T004 [P] Create base README.md with project overview in infrastructure/README.md

---

## Phase 2: Foundational (State Backend Bootstrap)

**Purpose**: Setup remote state infrastructure - MUST complete before any environment deployment

**⚠️ CRITICAL**: No environment can use remote state until this phase is complete

- [x] T005 Create bootstrap module directory structure in infrastructure/bootstrap/
- [x] T006 [P] Implement bootstrap variables.tf with state_bucket_name, lock_table_name, aws_region in infrastructure/bootstrap/variables.tf
- [x] T007 [P] Implement bootstrap outputs.tf with bucket and table outputs in infrastructure/bootstrap/outputs.tf
- [x] T008 Implement bootstrap main.tf with S3 bucket (encryption, versioning, public block) and DynamoDB table in infrastructure/bootstrap/main.tf
- [ ] T009 Run terraform validate on bootstrap module
- [ ] T010 Run terraform fmt -check on bootstrap module

**Checkpoint**: Bootstrap module ready - state backend can now be created

---

## Phase 3: User Story 1 - Provision Cloud Infrastructure (Priority: P1) 🎯 MVP

**Goal**: Enable DevOps engineers to provision cloud infrastructure using declarative configuration files

**Independent Test**: Deploy a VPC with subnets to AWS dev environment and verify resources are created

### Networking Module (Required for US1)

- [x] T011 [P] [US1] Create networking module directory structure in infrastructure/modules/networking/
- [x] T012 [P] [US1] Implement networking variables.tf with VPC, subnet, and security group inputs in infrastructure/modules/networking/variables.tf
- [x] T013 [P] [US1] Implement networking outputs.tf with vpc_id, subnet_ids, security_group_ids in infrastructure/modules/networking/outputs.tf
- [x] T014 [US1] Implement networking main.tf with VPC resource in infrastructure/modules/networking/main.tf
- [x] T015 [US1] Add public and private subnets to networking main.tf in infrastructure/modules/networking/main.tf
- [x] T016 [US1] Add internet gateway and NAT gateway to networking main.tf in infrastructure/modules/networking/main.tf
- [x] T017 [US1] Add route tables and associations to networking main.tf in infrastructure/modules/networking/main.tf
- [x] T018 [US1] Add security groups (app, db, alb) to networking main.tf in infrastructure/modules/networking/main.tf
- [x] T019 [P] [US1] Create networking README.md with usage examples in infrastructure/modules/networking/README.md

### Dev Environment (Required for US1)

- [x] T020 [US1] Create dev environment directory structure in infrastructure/environments/dev/
- [x] T021 [P] [US1] Implement dev backend.tf with S3 backend configuration (local state initially) in infrastructure/environments/dev/backend.tf
- [x] T022 [P] [US1] Implement dev variables.tf with environment-specific variable declarations in infrastructure/environments/dev/variables.tf
- [x] T023 [P] [US1] Implement dev terraform.tfvars with dev-specific values (t3.micro, single NAT) in infrastructure/environments/dev/terraform.tfvars
- [x] T024 [P] [US1] Implement dev outputs.tf with environment outputs in infrastructure/environments/dev/outputs.tf
- [x] T025 [US1] Implement dev main.tf with provider configuration and networking module call in infrastructure/environments/dev/main.tf

### Validation for US1

- [ ] T026 [US1] Run terraform validate on dev environment
- [ ] T027 [US1] Run terraform fmt -check -recursive on infrastructure/
- [ ] T028 [US1] Run terraform plan on dev environment to verify configuration

**Checkpoint**: User Story 1 complete - can provision VPC infrastructure to dev environment

---

## Phase 4: User Story 2 - Manage Multiple Environments (Priority: P2)

**Goal**: Enable separate environments (dev, staging, prod) with consistent configurations

**Independent Test**: Deploy same infrastructure to staging with different instance sizes and verify isolation

### Staging Environment

- [x] T029 [US2] Create staging environment directory structure in infrastructure/environments/staging/
- [x] T030 [P] [US2] Implement staging backend.tf with S3 backend configuration in infrastructure/environments/staging/backend.tf
- [x] T031 [P] [US2] Implement staging variables.tf mirroring dev structure in infrastructure/environments/staging/variables.tf
- [x] T032 [P] [US2] Implement staging terraform.tfvars with staging values (t3.small, multi-AZ consideration) in infrastructure/environments/staging/terraform.tfvars
- [x] T033 [P] [US2] Implement staging outputs.tf mirroring dev structure in infrastructure/environments/staging/outputs.tf
- [x] T034 [US2] Implement staging main.tf with provider and module calls in infrastructure/environments/staging/main.tf

### Production Environment

- [x] T035 [US2] Create prod environment directory structure in infrastructure/environments/prod/
- [x] T036 [P] [US2] Implement prod backend.tf with S3 backend configuration in infrastructure/environments/prod/backend.tf
- [x] T037 [P] [US2] Implement prod variables.tf mirroring dev structure in infrastructure/environments/prod/variables.tf
- [x] T038 [P] [US2] Implement prod terraform.tfvars with production values (t3.medium, multi-AZ, larger ASG) in infrastructure/environments/prod/terraform.tfvars
- [x] T039 [P] [US2] Implement prod outputs.tf mirroring dev structure in infrastructure/environments/prod/outputs.tf
- [x] T040 [US2] Implement prod main.tf with provider and module calls in infrastructure/environments/prod/main.tf

### Validation for US2

- [ ] T041 [US2] Run terraform validate on staging environment
- [ ] T042 [US2] Run terraform validate on prod environment
- [ ] T043 [US2] Verify environment isolation by comparing terraform plan outputs

**Checkpoint**: User Story 2 complete - three isolated environments configured

---

## Phase 5: User Story 3 - Track Infrastructure State (Priority: P2)

**Goal**: Enable remote state storage with locking for team collaboration

**Independent Test**: Two team members attempt concurrent terraform apply - second should be blocked by state lock

### Remote State Configuration

- [ ] T044 [US3] Update dev backend.tf to use remote S3 backend after bootstrap in infrastructure/environments/dev/backend.tf
- [ ] T045 [US3] Update staging backend.tf to use remote S3 backend in infrastructure/environments/staging/backend.tf
- [ ] T046 [US3] Update prod backend.tf to use remote S3 backend in infrastructure/environments/prod/backend.tf
- [ ] T047 [US3] Run terraform init with backend migration for dev environment
- [ ] T048 [US3] Verify state locking works by checking DynamoDB table entries

**Checkpoint**: User Story 3 complete - remote state with locking enabled for all environments

---

## Phase 6: User Story 4 - Reuse Infrastructure Patterns (Priority: P3)

**Goal**: Enable reusable infrastructure modules for consistency and reduced duplication

**Independent Test**: Deploy compute module in dev environment by adding module call to main.tf

### Compute Module

- [ ] T049 [P] [US4] Create compute module directory structure in infrastructure/modules/compute/
- [ ] T050 [P] [US4] Implement compute variables.tf with ASG, instance type, AMI inputs in infrastructure/modules/compute/variables.tf
- [ ] T051 [P] [US4] Implement compute outputs.tf with asg_name, instance_role_arn in infrastructure/modules/compute/outputs.tf
- [ ] T052 [US4] Implement compute main.tf with launch template and ASG in infrastructure/modules/compute/main.tf
- [ ] T053 [US4] Add IAM role and instance profile to compute main.tf in infrastructure/modules/compute/main.tf
- [ ] T054 [P] [US4] Create compute README.md with usage examples in infrastructure/modules/compute/README.md

### Database Module

- [ ] T055 [P] [US4] Create database module directory structure in infrastructure/modules/database/
- [ ] T056 [P] [US4] Implement database variables.tf with RDS configuration inputs in infrastructure/modules/database/variables.tf
- [ ] T057 [P] [US4] Implement database outputs.tf with endpoint, port, database_name in infrastructure/modules/database/outputs.tf
- [ ] T058 [US4] Implement database main.tf with RDS instance and subnet group in infrastructure/modules/database/main.tf
- [ ] T059 [US4] Add parameter group and Secrets Manager integration to database main.tf in infrastructure/modules/database/main.tf
- [ ] T060 [P] [US4] Create database README.md with usage examples in infrastructure/modules/database/README.md

### Storage Module

- [ ] T061 [P] [US4] Create storage module directory structure in infrastructure/modules/storage/
- [ ] T062 [P] [US4] Implement storage variables.tf with bucket configuration inputs in infrastructure/modules/storage/variables.tf
- [ ] T063 [P] [US4] Implement storage outputs.tf with bucket_id, bucket_arn in infrastructure/modules/storage/outputs.tf
- [ ] T064 [US4] Implement storage main.tf with S3 bucket, encryption, versioning, public block in infrastructure/modules/storage/main.tf
- [ ] T065 [P] [US4] Create storage README.md with usage examples in infrastructure/modules/storage/README.md

### Load Balancing Module

- [ ] T066 [P] [US4] Create load-balancing module directory structure in infrastructure/modules/load-balancing/
- [ ] T067 [P] [US4] Implement load-balancing variables.tf with ALB configuration inputs in infrastructure/modules/load-balancing/variables.tf
- [ ] T068 [P] [US4] Implement load-balancing outputs.tf with lb_dns_name, target_group_arn in infrastructure/modules/load-balancing/outputs.tf
- [ ] T069 [US4] Implement load-balancing main.tf with ALB, target group, listeners in infrastructure/modules/load-balancing/main.tf
- [ ] T070 [P] [US4] Create load-balancing README.md with usage examples in infrastructure/modules/load-balancing/README.md

### DNS Module

- [ ] T071 [P] [US4] Create dns module directory structure in infrastructure/modules/dns/
- [ ] T072 [P] [US4] Implement dns variables.tf with zone and record configuration inputs in infrastructure/modules/dns/variables.tf
- [ ] T073 [P] [US4] Implement dns outputs.tf with zone_id, record_fqdns in infrastructure/modules/dns/outputs.tf
- [ ] T074 [US4] Implement dns main.tf with Route53 zone and record resources in infrastructure/modules/dns/main.tf
- [ ] T075 [P] [US4] Create dns README.md with usage examples in infrastructure/modules/dns/README.md

### Module Integration

- [ ] T076 [US4] Update dev main.tf to include all modules with proper dependency ordering in infrastructure/environments/dev/main.tf
- [ ] T077 [US4] Run terraform validate on all modules
- [ ] T078 [US4] Run tflint on all modules

**Checkpoint**: User Story 4 complete - all 6 reusable modules available

---

## Phase 7: User Story 5 - Audit Infrastructure Changes (Priority: P3)

**Goal**: Enable auditing of all infrastructure changes for compliance verification

**Independent Test**: Make infrastructure change and verify audit trail in git log and terraform plan output

### Tagging Strategy

- [ ] T079 [US5] Implement default_tags in AWS provider configuration across all environments in infrastructure/environments/*/main.tf
- [ ] T080 [US5] Add environment, project, owner, managed_by tags to all module resources
- [ ] T081 [US5] Verify tags propagate correctly by running terraform plan

### Documentation

- [ ] T082 [P] [US5] Update infrastructure README.md with complete usage documentation in infrastructure/README.md
- [ ] T083 [P] [US5] Add CHANGELOG.md for tracking infrastructure changes in infrastructure/CHANGELOG.md
- [ ] T084 [P] [US5] Create .gitignore for Terraform files (.terraform/, *.tfstate, etc.) in infrastructure/.gitignore

**Checkpoint**: User Story 5 complete - audit trail and documentation in place

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [ ] T085 [P] Run terraform fmt -recursive on entire infrastructure/ directory
- [ ] T086 [P] Run tflint on entire infrastructure/ directory
- [ ] T087 Validate all environments with terraform validate
- [ ] T088 Run terraform plan on dev environment to verify complete configuration
- [ ] T089 [P] Update quickstart.md with actual commands and paths in specs/009-terraform-infrastructure/quickstart.md
- [ ] T090 Final review of all module README.md files for accuracy

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Bootstrap) ────────────────────────────────────────┐
    │                                                        │
    ▼                                                        │
Phase 3 (US1 - Provision) ◄──────────────────────────────────┤
    │                                                        │
    ├─────────────────┬──────────────────┐                  │
    ▼                 ▼                  ▼                  │
Phase 4 (US2)    Phase 5 (US3)    Phase 6 (US4)            │
    │                 │                  │                  │
    └─────────────────┴──────────────────┘                  │
                      │                                      │
                      ▼                                      │
               Phase 7 (US5) ◄───────────────────────────────┘
                      │
                      ▼
               Phase 8 (Polish)
```

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1 | P1 | Phase 2 (Bootstrap) | - |
| US2 | P2 | US1 (networking module) | US3, US4 |
| US3 | P2 | Phase 2 (Bootstrap), US2 (env directories) | US4 |
| US4 | P3 | US1 (for integration) | US2, US3 |
| US5 | P3 | US1-US4 (for tagging across modules) | - |

### Within Each User Story

- Variables/outputs before main.tf
- Main.tf before README
- Module implementation before environment integration
- Validation after implementation

### Parallel Opportunities

**Phase 1 (Setup)**: T002, T003, T004 can run in parallel

**Phase 2 (Bootstrap)**: T006, T007 can run in parallel

**Phase 3 (US1)**:
- T011, T012, T013 can run in parallel (module structure)
- T021, T022, T023, T024 can run in parallel (env files)

**Phase 4 (US2)**:
- All staging tasks (T030-T033) can run in parallel with prod tasks (T036-T039)

**Phase 6 (US4)**:
- All module directory/variable/output tasks can run in parallel across modules
- compute (T049-T054), database (T055-T060), storage (T061-T065), load-balancing (T066-T070), dns (T071-T075) can progress in parallel

---

## Parallel Example: Phase 6 Module Development

```bash
# Launch all module structure tasks in parallel:
Task: "Create compute module directory structure in infrastructure/modules/compute/"
Task: "Create database module directory structure in infrastructure/modules/database/"
Task: "Create storage module directory structure in infrastructure/modules/storage/"
Task: "Create load-balancing module directory structure in infrastructure/modules/load-balancing/"
Task: "Create dns module directory structure in infrastructure/modules/dns/"

# Then launch all variables.tf and outputs.tf in parallel:
Task: "Implement compute variables.tf..."
Task: "Implement compute outputs.tf..."
Task: "Implement database variables.tf..."
Task: "Implement database outputs.tf..."
# ... etc.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Bootstrap (T005-T010)
3. Complete Phase 3: User Story 1 (T011-T028)
4. **STOP and VALIDATE**: Run `terraform plan` on dev environment
5. Deploy networking to dev if ready

**MVP Scope**: 28 tasks for basic infrastructure provisioning capability

### Incremental Delivery

| Increment | Stories | Cumulative Capability |
|-----------|---------|----------------------|
| MVP | US1 | Deploy networking to dev |
| +Environments | US2 | Deploy to dev/staging/prod |
| +Remote State | US3 | Team collaboration with locking |
| +Modules | US4 | Full stack (compute, DB, storage, ALB, DNS) |
| +Audit | US5 | Compliance-ready with tagging |

### Full Implementation

Total: **90 tasks**
- Phase 1 (Setup): 4 tasks
- Phase 2 (Bootstrap): 6 tasks
- Phase 3 (US1): 18 tasks
- Phase 4 (US2): 15 tasks
- Phase 5 (US3): 5 tasks
- Phase 6 (US4): 30 tasks
- Phase 7 (US5): 6 tasks
- Phase 8 (Polish): 6 tasks

---

## Notes

- [P] tasks = different files, can run in parallel
- [US#] label maps task to specific user story
- Each user story is independently completable and testable
- Terraform validation (`terraform validate`, `terraform fmt`, `tflint`) after each module
- Commit after each module or logical group of files
- Stop at any checkpoint to validate story independently
