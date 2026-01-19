# Terraform Module Contracts

**Feature**: 009-terraform-infrastructure
**Date**: 2026-01-18
**Purpose**: Formal input/output specifications for each Terraform module

## Contract Format

Each module contract follows this structure:
- **Inputs**: Required and optional variables with types and validation
- **Outputs**: Values exposed for consumption by other modules
- **Resources**: AWS resources created by the module
- **Dependencies**: What this module requires from other modules

---

## Module: bootstrap

**Purpose**: One-time setup for Terraform state backend (S3 + DynamoDB)

### Inputs

```hcl
variable "state_bucket_name" {
  description = "Name for the S3 bucket storing Terraform state"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.state_bucket_name))
    error_message = "Bucket name must be valid S3 bucket name."
  }
}

variable "lock_table_name" {
  description = "Name for the DynamoDB table for state locking"
  type        = string
  default     = "terraform-state-locks"
}

variable "aws_region" {
  description = "AWS region for state resources"
  type        = string
  default     = "us-east-1"
}
```

### Outputs

```hcl
output "state_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.state.id
}

output "state_bucket_arn" {
  description = "ARN of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.state.arn
}

output "lock_table_name" {
  description = "Name of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.locks.name
}

output "lock_table_arn" {
  description = "ARN of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.locks.arn
}
```

### Resources Created

| Resource Type | Name Pattern | Purpose |
|---------------|--------------|---------|
| aws_s3_bucket | `{state_bucket_name}` | State file storage |
| aws_s3_bucket_versioning | - | State version history |
| aws_s3_bucket_server_side_encryption_configuration | - | Encryption at rest |
| aws_s3_bucket_public_access_block | - | Block public access |
| aws_dynamodb_table | `{lock_table_name}` | State locking |

---

## Module: networking

**Purpose**: VPC, subnets, security groups, NAT gateways, route tables

### Inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "project" {
  description = "Project identifier for resource naming"
  type        = string
  default     = "shannon"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be valid CIDR notation."
  }
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones required."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnet internet access"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use single NAT Gateway (cost saving for non-prod)"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ips" {
  description = "Elastic IPs of NAT Gateways"
  value       = aws_eip.nat[*].public_ip
}

output "app_security_group_id" {
  description = "Security group ID for application servers"
  value       = aws_security_group.app.id
}

output "db_security_group_id" {
  description = "Security group ID for databases"
  value       = aws_security_group.db.id
}

output "alb_security_group_id" {
  description = "Security group ID for load balancers"
  value       = aws_security_group.alb.id
}
```

### Resources Created

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| aws_vpc | 1 | Virtual private cloud |
| aws_subnet (public) | 2+ | Public subnets per AZ |
| aws_subnet (private) | 2+ | Private subnets per AZ |
| aws_internet_gateway | 1 | Internet access for public subnets |
| aws_nat_gateway | 1-2 | Internet access for private subnets |
| aws_eip | 1-2 | Elastic IPs for NAT |
| aws_route_table | 3+ | Routing for subnets |
| aws_security_group | 3 | App, DB, ALB security groups |

---

## Module: compute

**Purpose**: EC2 instances, Auto Scaling Groups, launch templates

### Inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project identifier"
  type        = string
  default     = "shannon"
}

variable "vpc_id" {
  description = "VPC ID from networking module"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for instances (private subnets)"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs to attach"
  type        = list(string)
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "ami_id" {
  description = "AMI ID (uses latest Amazon Linux 2023 if null)"
  type        = string
  default     = null
}

variable "key_name" {
  description = "SSH key pair name"
  type        = string
  default     = null
}

variable "min_size" {
  description = "Minimum ASG size"
  type        = number
  default     = 1

  validation {
    condition     = var.min_size >= 0
    error_message = "Minimum size must be >= 0."
  }
}

variable "max_size" {
  description = "Maximum ASG size"
  type        = number
  default     = 3
}

variable "desired_capacity" {
  description = "Desired ASG capacity"
  type        = number
  default     = 1
}

variable "health_check_type" {
  description = "Health check type (EC2 or ELB)"
  type        = string
  default     = "ELB"

  validation {
    condition     = contains(["EC2", "ELB"], var.health_check_type)
    error_message = "Health check type must be EC2 or ELB."
  }
}

variable "user_data" {
  description = "User data script for instances"
  type        = string
  default     = ""
}

variable "target_group_arns" {
  description = "Target group ARNs for ALB attachment"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
output "asg_name" {
  description = "Auto Scaling Group name"
  value       = aws_autoscaling_group.main.name
}

output "asg_arn" {
  description = "Auto Scaling Group ARN"
  value       = aws_autoscaling_group.main.arn
}

output "launch_template_id" {
  description = "Launch template ID"
  value       = aws_launch_template.main.id
}

output "launch_template_latest_version" {
  description = "Latest version of launch template"
  value       = aws_launch_template.main.latest_version
}

output "instance_role_arn" {
  description = "IAM role ARN for EC2 instances"
  value       = aws_iam_role.instance.arn
}

output "instance_role_name" {
  description = "IAM role name for EC2 instances"
  value       = aws_iam_role.instance.name
}

output "instance_profile_arn" {
  description = "IAM instance profile ARN"
  value       = aws_iam_instance_profile.main.arn
}
```

### Resources Created

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| aws_launch_template | 1 | Instance configuration template |
| aws_autoscaling_group | 1 | Auto-scaling of instances |
| aws_iam_role | 1 | IAM role for EC2 instances |
| aws_iam_instance_profile | 1 | Instance profile for role attachment |
| aws_iam_role_policy_attachment | 1+ | Attach policies to role |

---

## Module: database

**Purpose**: RDS PostgreSQL instances

### Inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project identifier"
  type        = string
  default     = "shannon"
}

variable "vpc_id" {
  description = "VPC ID from networking module"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for RDS (private subnets, min 2)"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets required for RDS."
  }
}

variable "security_group_ids" {
  description = "Security group IDs for RDS"
  type        = list(string)
}

variable "engine" {
  description = "Database engine"
  type        = string
  default     = "postgres"

  validation {
    condition     = contains(["postgres", "mysql"], var.engine)
    error_message = "Engine must be postgres or mysql."
  }
}

variable "engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20

  validation {
    condition     = var.allocated_storage >= 20 && var.allocated_storage <= 65536
    error_message = "Allocated storage must be between 20 and 65536 GB."
  }
}

variable "database_name" {
  description = "Name of the default database"
  type        = string
}

variable "master_username" {
  description = "Master username"
  type        = string
}

variable "master_password_secret_id" {
  description = "AWS Secrets Manager secret ID for master password"
  type        = string
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention must be between 0 and 35 days."
  }
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
output "endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "RDS instance address (hostname only)"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Name of the default database"
  value       = aws_db_instance.main.db_name
}

output "db_instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.id
}

output "db_instance_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.main.arn
}

output "db_subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.main.name
}
```

### Resources Created

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| aws_db_subnet_group | 1 | Subnet group for RDS |
| aws_db_instance | 1 | RDS database instance |
| aws_db_parameter_group | 1 | Database parameters |

---

## Module: storage

**Purpose**: S3 buckets with security configurations

### Inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project identifier"
  type        = string
  default     = "shannon"
}

variable "bucket_name" {
  description = "S3 bucket name (must be globally unique)"
  type        = string
}

variable "versioning_enabled" {
  description = "Enable versioning"
  type        = bool
  default     = true
}

variable "block_public_access" {
  description = "Block all public access"
  type        = bool
  default     = true
}

variable "encryption_algorithm" {
  description = "Server-side encryption algorithm"
  type        = string
  default     = "AES256"

  validation {
    condition     = contains(["AES256", "aws:kms"], var.encryption_algorithm)
    error_message = "Encryption must be AES256 or aws:kms."
  }
}

variable "lifecycle_rules" {
  description = "Lifecycle rules for object management"
  type = list(object({
    id      = string
    enabled = bool
    prefix  = string
    expiration_days = number
  }))
  default = []
}

variable "cors_rules" {
  description = "CORS rules for bucket"
  type = list(object({
    allowed_headers = list(string)
    allowed_methods = list(string)
    allowed_origins = list(string)
    max_age_seconds = number
  }))
  default = []
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
output "bucket_id" {
  description = "S3 bucket ID (name)"
  value       = aws_s3_bucket.main.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.main.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the bucket"
  value       = aws_s3_bucket.main.bucket_regional_domain_name
}

output "bucket_domain_name" {
  description = "Domain name of the bucket"
  value       = aws_s3_bucket.main.bucket_domain_name
}
```

### Resources Created

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| aws_s3_bucket | 1 | S3 bucket |
| aws_s3_bucket_versioning | 1 | Versioning configuration |
| aws_s3_bucket_server_side_encryption_configuration | 1 | Encryption configuration |
| aws_s3_bucket_public_access_block | 1 | Public access blocking |
| aws_s3_bucket_lifecycle_configuration | 0-1 | Lifecycle rules |
| aws_s3_bucket_cors_configuration | 0-1 | CORS configuration |

---

## Module: load-balancing

**Purpose**: Application Load Balancers with target groups

### Inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project identifier"
  type        = string
  default     = "shannon"
}

variable "vpc_id" {
  description = "VPC ID from networking module"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for ALB (public subnets)"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs for ALB"
  type        = list(string)
}

variable "lb_type" {
  description = "Load balancer type"
  type        = string
  default     = "application"

  validation {
    condition     = contains(["application", "network"], var.lb_type)
    error_message = "Load balancer type must be application or network."
  }
}

variable "internal" {
  description = "Create internal load balancer"
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
  default     = null
}

variable "http_port" {
  description = "HTTP listener port"
  type        = number
  default     = 80
}

variable "https_port" {
  description = "HTTPS listener port"
  type        = number
  default     = 443
}

variable "target_port" {
  description = "Target port for instances"
  type        = number
  default     = 80
}

variable "health_check_path" {
  description = "Health check path"
  type        = string
  default     = "/health"
}

variable "health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
output "lb_arn" {
  description = "Load balancer ARN"
  value       = aws_lb.main.arn
}

output "lb_dns_name" {
  description = "Load balancer DNS name"
  value       = aws_lb.main.dns_name
}

output "lb_zone_id" {
  description = "Load balancer canonical hosted zone ID"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "Target group ARN"
  value       = aws_lb_target_group.main.arn
}

output "http_listener_arn" {
  description = "HTTP listener ARN"
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "HTTPS listener ARN (if certificate provided)"
  value       = try(aws_lb_listener.https[0].arn, null)
}
```

### Resources Created

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| aws_lb | 1 | Load balancer |
| aws_lb_target_group | 1 | Target group for instances |
| aws_lb_listener | 1-2 | HTTP and HTTPS listeners |

---

## Module: dns

**Purpose**: Route53 hosted zones and records

### Inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project identifier"
  type        = string
  default     = "shannon"
}

variable "zone_name" {
  description = "Domain name for the hosted zone"
  type        = string
}

variable "create_zone" {
  description = "Create new hosted zone (false to use existing)"
  type        = bool
  default     = false
}

variable "zone_id" {
  description = "Existing zone ID (required if create_zone is false)"
  type        = string
  default     = null
}

variable "records" {
  description = "Standard DNS records to create"
  type = list(object({
    name    = string
    type    = string
    ttl     = number
    records = list(string)
  }))
  default = []
}

variable "alias_records" {
  description = "Alias records (for ALB, CloudFront, etc.)"
  type = list(object({
    name                   = string
    type                   = string
    alias_name             = string
    alias_zone_id          = string
    evaluate_target_health = bool
  }))
  default = []
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = var.create_zone ? aws_route53_zone.main[0].zone_id : var.zone_id
}

output "zone_name" {
  description = "Route53 hosted zone name"
  value       = var.zone_name
}

output "name_servers" {
  description = "Name servers for the zone (if created)"
  value       = var.create_zone ? aws_route53_zone.main[0].name_servers : []
}

output "record_fqdns" {
  description = "Map of record names to FQDNs"
  value       = { for r in aws_route53_record.standard : r.name => r.fqdn }
}
```

### Resources Created

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| aws_route53_zone | 0-1 | Hosted zone (if creating) |
| aws_route53_record | N | DNS records |
