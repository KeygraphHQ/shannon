# Shannon Infrastructure

Terraform-based AWS infrastructure for the Shannon platform.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) >= 1.5.0
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [TFLint](https://github.com/terraform-linters/tflint) for linting

## Directory Structure

```
infrastructure/
├── bootstrap/           # One-time state backend setup
├── modules/             # Reusable Terraform modules
│   ├── networking/      # VPC, subnets, security groups
│   ├── compute/         # EC2, Auto Scaling Groups
│   ├── database/        # RDS PostgreSQL
│   ├── storage/         # S3 buckets
│   ├── load-balancing/  # ALB/NLB
│   └── dns/             # Route53
└── environments/        # Environment-specific configurations
    ├── dev/             # Development environment
    ├── staging/         # Staging environment
    └── prod/            # Production environment
```

## Quick Start

### 1. Bootstrap State Backend (One-Time)

```bash
cd infrastructure/bootstrap
terraform init
terraform plan
terraform apply
```

### 2. Deploy Development Environment

```bash
cd infrastructure/environments/dev
terraform init
terraform plan
terraform apply
```

## Naming Convention

Resources follow the pattern: `{env}-{project}-{resource}`

Examples:
- `dev-shannon-vpc`
- `prod-shannon-rds`
- `staging-shannon-alb`

## Environment Differences

| Setting | Dev | Staging | Prod |
|---------|-----|---------|------|
| Instance Type | t3.micro | t3.small | t3.medium |
| NAT Gateway | Single | Single | Multi-AZ |
| RDS Multi-AZ | No | No | Yes |
| Min ASG Size | 1 | 2 | 3 |

## Validation Commands

```bash
# Format check
terraform fmt -check -recursive

# Validate configuration
terraform validate

# Lint with TFLint
tflint --recursive
```

## Related Documentation

- [Quickstart Guide](../specs/009-terraform-infrastructure/quickstart.md)
- [Module Contracts](../specs/009-terraform-infrastructure/contracts/module-contracts.md)
- [Data Model](../specs/009-terraform-infrastructure/data-model.md)
