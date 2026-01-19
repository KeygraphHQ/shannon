# Research: Terraform Infrastructure Best Practices

**Feature**: 009-terraform-infrastructure
**Date**: 2026-01-18
**Purpose**: Document decisions, rationale, and best practices for Terraform AWS infrastructure

## 1. Remote State Backend

### Decision: S3 + DynamoDB for State Management

**Rationale**:
- S3 provides durable, versioned storage for state files
- DynamoDB provides state locking to prevent concurrent modifications
- Native AWS integration with IAM for access control
- Server-side encryption (SSE-S3 or SSE-KMS) for data at rest
- Cost-effective for small-to-medium state files

**Alternatives Considered**:

| Option | Pros | Cons | Why Rejected |
|--------|------|------|--------------|
| Terraform Cloud | Managed service, built-in collaboration | Vendor lock-in, cost at scale | Adds external dependency, prefer AWS-native |
| Local state | Simple, no setup | No collaboration, no locking | Doesn't support team workflows |
| Consul | Distributed, highly available | Complex setup, additional infrastructure | Over-engineered for current needs |

**Configuration Pattern**:
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "shannon-terraform-state"
    key            = "environments/${var.environment}/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "shannon-terraform-locks"
  }
}
```

## 2. AWS Provider Configuration

### Decision: Provider Version Pinning with Flexible Patch Updates

**Rationale**:
- Pin to major.minor version (~> 5.0) to allow patch updates
- Prevents breaking changes while receiving security fixes
- Explicit region configuration per environment
- Use `default_tags` for consistent resource tagging

**Configuration Pattern**:
```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "shannon"
      ManagedBy   = "terraform"
    }
  }
}
```

## 3. Module Design Patterns

### Decision: Composable Modules with Explicit Interfaces

**Rationale**:
- Each module handles one infrastructure concern (single responsibility)
- Clear input variables with validation rules
- Outputs expose only what consumers need
- Modules don't depend on other modules directly (composition in environments)

**Alternatives Considered**:

| Option | Pros | Cons | Why Rejected |
|--------|------|------|--------------|
| Monolithic configuration | Simple, all in one place | Hard to maintain, no reuse | Doesn't scale with complexity |
| Nested modules | Encapsulates complex patterns | Hidden complexity, harder debugging | Over-abstraction for current needs |
| Terraform Registry modules | Battle-tested, feature-rich | Less control, may include unused features | Prefer purpose-built modules |

**Module Interface Pattern**:
```hcl
# variables.tf
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

# outputs.tf
output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}
```

## 4. Environment-Specific Configuration

### Decision: Directory-Based Separation with Shared Variables Schema

**Rationale**:
- Each environment has its own directory with isolated state
- Common variable schema ensures consistency
- `terraform.tfvars` contains environment-specific values
- Easy to audit differences between environments

**Directory Pattern**:
```
environments/
├── dev/
│   ├── main.tf           # Module composition
│   ├── variables.tf      # Variable declarations (same schema)
│   ├── terraform.tfvars  # Dev values (smaller instances, etc.)
│   └── backend.tf        # Dev state backend key
├── staging/
│   └── ...               # Same structure, different values
└── prod/
    └── ...               # Same structure, production values
```

**Environment Variable Differences**:

| Variable | Dev | Staging | Prod |
|----------|-----|---------|------|
| `instance_type` | t3.micro | t3.small | t3.medium |
| `rds_instance_class` | db.t3.micro | db.t3.small | db.t3.medium |
| `min_asg_size` | 1 | 2 | 3 |
| `max_asg_size` | 2 | 4 | 10 |
| `multi_az` | false | false | true |

## 5. Variable Management and Secrets

### Decision: Layered Variable Sources with Secrets Manager Integration

**Rationale**:
- `terraform.tfvars` for non-sensitive, environment-specific values
- Environment variables (`TF_VAR_*`) for CI/CD overrides
- AWS Secrets Manager for sensitive values (DB passwords, API keys)
- Never commit secrets to version control

**Variable Sources (precedence order)**:
1. Command line `-var` flags (highest)
2. `*.auto.tfvars` files
3. `terraform.tfvars` file
4. Environment variables (`TF_VAR_*`)
5. Default values in `variables.tf` (lowest)

**Secrets Pattern**:
```hcl
# Retrieve secret from AWS Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "shannon/${var.environment}/db-password"
}

# Use in resource
resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
  # ...
}
```

## 6. Tagging Strategy

### Decision: Mandatory Tags via Provider Default Tags + Resource-Specific Tags

**Rationale**:
- Provider-level `default_tags` ensures all resources are tagged
- Resource-specific tags add granular metadata
- Enables cost allocation, security auditing, and lifecycle management
- Consistent naming convention across all resources

**Mandatory Tags**:

| Tag | Description | Example |
|-----|-------------|---------|
| `Environment` | Deployment environment | dev, staging, prod |
| `Project` | Project identifier | shannon |
| `ManagedBy` | Tool managing resource | terraform |
| `Owner` | Team or individual owner | platform-team |

**Optional Tags**:

| Tag | Description | Example |
|-----|-------------|---------|
| `CostCenter` | Cost allocation code | engineering |
| `DataClassification` | Data sensitivity level | confidential |
| `Compliance` | Compliance requirements | soc2 |

## 7. Security Best Practices

### Decision: Defense in Depth with Least Privilege

**Implemented Controls**:

1. **State Security**:
   - S3 bucket encryption (AES-256)
   - Bucket versioning enabled
   - Block public access
   - IAM policies restrict access to authorized roles

2. **Network Security**:
   - Private subnets for databases and internal services
   - Security groups with minimal required ports
   - VPC flow logs for network monitoring

3. **Access Control**:
   - IAM roles for EC2 instances (not access keys)
   - Separate IAM policies per environment
   - MFA required for production changes (via AWS Organizations SCP)

4. **Secrets Management**:
   - No hardcoded secrets in Terraform files
   - AWS Secrets Manager for sensitive values
   - Rotation policies for credentials

## 8. Validation and Linting

### Decision: Pre-Commit Validation with TFLint

**Rationale**:
- `terraform fmt` ensures consistent formatting
- `terraform validate` catches syntax errors
- TFLint catches AWS-specific issues and best practice violations
- Pre-commit hooks enforce checks before commits

**TFLint Configuration** (`.tflint.hcl`):
```hcl
plugin "aws" {
  enabled = true
  version = "0.27.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_documented_variables" {
  enabled = true
}
```

## 9. Drift Detection

### Decision: Scheduled Plan-Only Runs

**Rationale**:
- Regular `terraform plan` runs detect manual changes
- Alerts on drift without automatic remediation
- Human review before applying corrections
- Integration with monitoring/alerting system

**Implementation**:
- CI/CD scheduled job runs `terraform plan` nightly
- Non-zero exit code triggers alert
- Plan output saved for review

## 10. Module Dependency Order

### Decision: Explicit Dependency Graph

Infrastructure modules have natural dependencies that determine deployment order:

```
1. Bootstrap (state backend) - One-time, manual
   └── 2. Networking (VPC, subnets, security groups)
       ├── 3. Storage (S3 buckets)
       ├── 4. Database (RDS - requires VPC subnets)
       ├── 5. Compute (EC2/ASG - requires VPC, security groups)
       │   └── 6. Load Balancing (ALB - requires compute targets)
       └── 7. DNS (Route53 - requires ALB endpoints)
```

**Composition Pattern in Environment Main**:
```hcl
module "networking" {
  source = "../../modules/networking"
  # ...
}

module "database" {
  source = "../../modules/database"

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids
  # ...
}

module "compute" {
  source = "../../modules/compute"

  vpc_id            = module.networking.vpc_id
  subnet_ids        = module.networking.private_subnet_ids
  security_group_id = module.networking.app_security_group_id
  # ...
}
```

## Summary of Key Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| State Backend | S3 + DynamoDB | AWS-native, encrypted, supports locking |
| Provider Version | ~> 5.0 | Flexible patches, stable major |
| Module Pattern | Composable, single-responsibility | Maintainable, testable |
| Environment Separation | Directory-based | Clear isolation, easy auditing |
| Secrets | AWS Secrets Manager | Never in code, rotation support |
| Tagging | Provider default_tags | Consistent, automatic |
| Validation | TFLint + terraform validate | Catch issues early |
| Drift Detection | Scheduled plans | Alert without auto-fix |
