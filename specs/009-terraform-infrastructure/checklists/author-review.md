# Requirements Quality Checklist: Author Self-Review

**Purpose**: Pre-commit sanity check for requirements completeness and clarity
**Created**: 2026-01-18
**Feature**: [009-terraform-infrastructure](../spec.md)
**Audience**: Author (self-review before PR)
**Depth**: Light (comprehensive coverage, ~15 items)

## Checklist Scope

- Security & State Management
- Module Interface Design
- Environment Consistency
- Operational Readiness

---

## Security & State Management

- [ ] CHK001 - Is state backup/recovery procedure documented for scenarios where state becomes corrupted or lost? [Gap, Edge Case §3]
- [ ] CHK002 - Are IAM permission requirements specified with sufficient detail for state backend access? [Clarity, Spec §FR-004a]
- [ ] CHK003 - Are sensitive value handling requirements complete for all module types (RDS passwords, API keys)? [Completeness, Spec §Assumptions]

## Module Interface Design

- [ ] CHK004 - Are module versioning requirements documented for managing breaking changes across environments? [Gap]
- [ ] CHK005 - Are input variable validation rules specified for all required module inputs? [Completeness, data-model.md]
- [ ] CHK006 - Are module dependency relationships explicitly documented (which modules require outputs from others)? [Clarity, data-model.md]

## Environment Consistency

- [ ] CHK007 - Is the environment promotion workflow (dev→staging→prod) documented with specific steps? [Gap, Spec §US2]
- [ ] CHK008 - Are environment-specific resource naming conventions defined and consistent? [Clarity, Spec §FR-010]
- [ ] CHK009 - Are environment variable differences (instance sizes, multi-AZ) explicitly documented per environment? [Completeness, plan.md]

## Operational Readiness

- [ ] CHK010 - Are deployment timeout/retry requirements specified for long-running operations? [Gap, Spec §SC-001]
- [ ] CHK011 - Is the drift detection and remediation workflow documented beyond "detect and offer options"? [Clarity, Edge Case §2]
- [ ] CHK012 - Are CI/CD pipeline requirements specified despite "initial focus on local CLI"? [Completeness, Spec §Assumptions]

## Scenario Coverage

- [ ] CHK013 - Are partial deployment failure requirements defined (what happens if only some resources are created)? [Gap, Exception Flow]
- [ ] CHK014 - Are requirements specified for deploying to an environment with existing manual resources? [Coverage, Spec §FR-012]
- [ ] CHK015 - Is the bootstrap-to-environment dependency explicitly documented (bootstrap must complete before any environment)? [Clarity, plan.md]

---

## Summary

| Category | Items | Focus |
|----------|-------|-------|
| Security & State | 3 | IAM clarity, recovery procedures, secrets handling |
| Module Design | 3 | Versioning, validation, dependencies |
| Environment | 3 | Promotion workflow, naming, variable docs |
| Operations | 3 | Timeouts, drift workflow, CI/CD |
| Scenarios | 3 | Partial failures, imports, bootstrap dependency |

**Total Items**: 15

## Usage Notes

- Run through this checklist before creating a PR
- Items marked [Gap] indicate missing requirements that may need spec updates
- Items marked [Clarity] indicate existing requirements that may be ambiguous
- Items marked [Completeness] indicate partial coverage that could be expanded
