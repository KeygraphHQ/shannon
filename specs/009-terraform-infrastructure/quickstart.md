# Quickstart: Terraform Infrastructure

**Feature**: 009-terraform-infrastructure
**Date**: 2026-01-18
**Purpose**: Developer onboarding guide for infrastructure deployment

## Prerequisites

Before you begin, ensure you have:

1. **Terraform CLI** (v1.5.0 or later)
   ```bash
   # Check version
   terraform version

   # Install via tfenv (recommended)
   brew install tfenv
   tfenv install 1.6.0
   tfenv use 1.6.0
   ```

2. **AWS CLI** configured with credentials
   ```bash
   # Configure AWS credentials
   aws configure

   # Verify access
   aws sts get-caller-identity
   ```

3. **Required AWS Permissions**
   - EC2, VPC, RDS, S3, Route53, IAM
   - DynamoDB (for state locking)
   - Secrets Manager (for database passwords)

## Quick Start (5 minutes)

### 1. Bootstrap State Backend (One-Time)

```bash
cd infrastructure/bootstrap

# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Create state backend resources
terraform apply
```

This creates:
- S3 bucket for state storage (encrypted)
- DynamoDB table for state locking

### 2. Deploy Development Environment

```bash
cd infrastructure/environments/dev

# Initialize with remote backend
terraform init

# Review planned changes
terraform plan

# Apply infrastructure
terraform apply
```

### 3. Verify Deployment

```bash
# Check created resources
terraform output

# Example outputs:
# vpc_id = "vpc-0abc123def456"
# alb_dns_name = "shannon-dev-alb-123456.us-east-1.elb.amazonaws.com"
# rds_endpoint = "shannon-dev-db.abc123.us-east-1.rds.amazonaws.com:5432"
```

## Directory Structure

```
infrastructure/
├── bootstrap/           # One-time state backend setup
├── modules/             # Reusable Terraform modules
│   ├── networking/      # VPC, subnets, security groups
│   ├── compute/         # EC2, Auto Scaling
│   ├── database/        # RDS
│   ├── storage/         # S3
│   ├── load-balancing/  # ALB/NLB
│   └── dns/             # Route53
└── environments/        # Environment-specific configs
    ├── dev/
    ├── staging/
    └── prod/
```

## Common Operations

### View Current State

```bash
cd infrastructure/environments/dev
terraform show
```

### Plan Changes (Dry Run)

```bash
terraform plan -out=tfplan

# Review the plan file
terraform show tfplan
```

### Apply Changes

```bash
# Apply a saved plan
terraform apply tfplan

# Or apply directly (prompts for confirmation)
terraform apply
```

### Destroy Infrastructure

```bash
# Preview destruction
terraform plan -destroy

# Destroy (requires confirmation)
terraform destroy
```

### Format Code

```bash
# Format all .tf files
terraform fmt -recursive

# Check formatting without changes
terraform fmt -check -recursive
```

### Validate Configuration

```bash
terraform validate
```

## Environment-Specific Deployment

### Development
```bash
cd infrastructure/environments/dev
terraform init
terraform apply
```

### Staging
```bash
cd infrastructure/environments/staging
terraform init
terraform apply
```

### Production
```bash
cd infrastructure/environments/prod
terraform init
terraform apply

# Production requires extra confirmation
# Consider using: terraform apply -auto-approve=false
```

## Working with Modules

### Using a Module in Environment Config

```hcl
# environments/dev/main.tf

module "networking" {
  source = "../../modules/networking"

  environment = var.environment
  project     = var.project
  vpc_cidr    = var.vpc_cidr
}

module "compute" {
  source = "../../modules/compute"

  environment        = var.environment
  project            = var.project
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.app_security_group_id]
  instance_type      = var.instance_type
}
```

### Module Dependencies

Modules reference each other's outputs:
```hcl
# compute module uses networking outputs
vpc_id     = module.networking.vpc_id
subnet_ids = module.networking.private_subnet_ids
```

## Configuration Variables

### Setting Variables

1. **terraform.tfvars** (environment-specific defaults)
   ```hcl
   # environments/dev/terraform.tfvars
   environment    = "dev"
   instance_type  = "t3.micro"
   min_asg_size   = 1
   ```

2. **Command line**
   ```bash
   terraform apply -var="instance_type=t3.small"
   ```

3. **Environment variables**
   ```bash
   export TF_VAR_instance_type="t3.small"
   terraform apply
   ```

### Viewing Variable Values

```bash
# Show all variables
terraform console
> var.environment
"dev"
> var.instance_type
"t3.micro"
```

## Remote State

### State Location
- **Bucket**: `shannon-terraform-state`
- **Key Pattern**: `environments/{env}/terraform.tfstate`
- **Lock Table**: `shannon-terraform-locks`

### View State
```bash
# List resources in state
terraform state list

# Show specific resource
terraform state show aws_vpc.main
```

### Import Existing Resources
```bash
# Import existing VPC into state
terraform import module.networking.aws_vpc.main vpc-0abc123
```

## Troubleshooting

### State Lock Issues

```bash
# If a lock is stuck (after crash)
terraform force-unlock LOCK_ID

# Get lock ID from error message
```

### Provider Version Conflicts

```bash
# Upgrade providers
terraform init -upgrade

# Pin specific version in versions.tf
```

### Resource Drift

```bash
# Detect drift
terraform plan

# Refresh state from actual infrastructure
terraform refresh
```

## Security Notes

1. **Never commit secrets** to `.tfvars` or any file
2. **Use Secrets Manager** for sensitive values
3. **Review plans** before applying to production
4. **Enable MFA** for production AWS operations
5. **Rotate credentials** every 90 days

## Next Steps

1. Review [data-model.md](data-model.md) for module interfaces
2. Review [contracts/module-contracts.md](contracts/module-contracts.md) for detailed specifications
3. Check [research.md](research.md) for architectural decisions

## Getting Help

- Terraform Documentation: https://terraform.io/docs
- AWS Provider: https://registry.terraform.io/providers/hashicorp/aws
- Team Slack: #platform-infrastructure
