# Data Model: Terraform Module Interfaces

**Feature**: 009-terraform-infrastructure
**Date**: 2026-01-18
**Purpose**: Define module interfaces, variable schemas, and output contracts

## Overview

This document defines the "data model" for Terraform infrastructure - the module interfaces that govern how components interact. Each module has:
- **Input Variables**: Configuration parameters with validation
- **Output Values**: Data exposed to consuming modules
- **Relationships**: Dependencies between modules

## Module Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Environment Layer                            │
│  (environments/dev/, environments/staging/, environments/prod/)      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Module Layer                               │
│                                                                      │
│  ┌──────────────┐                                                   │
│  │  networking  │ ◄─────────────────────────────────────────┐       │
│  │    (VPC)     │                                           │       │
│  └──────┬───────┘                                           │       │
│         │                                                   │       │
│         │ vpc_id, subnet_ids, security_group_ids            │       │
│         ▼                                                   │       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │       │
│  │   compute    │    │   database   │    │   storage    │  │       │
│  │  (EC2/ASG)   │    │    (RDS)     │    │    (S3)      │  │       │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │       │
│         │                                                   │       │
│         │ instance_ids, target_group_arn                    │       │
│         ▼                                                   │       │
│  ┌──────────────┐                                           │       │
│  │load-balancing│                                           │       │
│  │  (ALB/NLB)   │                                           │       │
│  └──────┬───────┘                                           │       │
│         │                                                   │       │
│         │ alb_dns_name                                      │       │
│         ▼                                                   │       │
│  ┌──────────────┐                                           │       │
│  │     dns      │───────────────────────────────────────────┘       │
│  │  (Route53)   │                                                   │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Common Variables (All Modules)

These variables are shared across all modules to ensure consistency:

| Variable | Type | Required | Description | Validation |
|----------|------|----------|-------------|------------|
| `environment` | string | Yes | Environment name | Must be: dev, staging, prod |
| `project` | string | Yes | Project identifier | Default: "shannon" |
| `aws_region` | string | Yes | AWS region | Default: "us-east-1" |
| `tags` | map(string) | No | Additional resource tags | - |

## Module: networking

Manages VPC, subnets, security groups, and route tables.

### Input Variables

| Variable | Type | Required | Default | Description | Validation |
|----------|------|----------|---------|-------------|------------|
| `vpc_cidr` | string | Yes | "10.0.0.0/16" | VPC CIDR block | Valid CIDR notation |
| `availability_zones` | list(string) | No | ["us-east-1a", "us-east-1b"] | AZs for subnets | Min 2 AZs |
| `public_subnet_cidrs` | list(string) | No | ["10.0.1.0/24", "10.0.2.0/24"] | Public subnet CIDRs | Match AZ count |
| `private_subnet_cidrs` | list(string) | No | ["10.0.10.0/24", "10.0.20.0/24"] | Private subnet CIDRs | Match AZ count |
| `enable_nat_gateway` | bool | No | true | Enable NAT for private subnets | - |
| `single_nat_gateway` | bool | No | true | Use single NAT (cost saving) | - |

### Output Values

| Output | Type | Description | Consumers |
|--------|------|-------------|-----------|
| `vpc_id` | string | VPC identifier | compute, database, load-balancing |
| `public_subnet_ids` | list(string) | Public subnet IDs | load-balancing |
| `private_subnet_ids` | list(string) | Private subnet IDs | compute, database |
| `nat_gateway_ips` | list(string) | NAT Gateway public IPs | External whitelisting |
| `app_security_group_id` | string | Security group for app servers | compute |
| `db_security_group_id` | string | Security group for databases | database |
| `alb_security_group_id` | string | Security group for load balancers | load-balancing |

## Module: compute

Manages EC2 instances, Auto Scaling Groups, and launch templates.

### Input Variables

| Variable | Type | Required | Default | Description | Validation |
|----------|------|----------|---------|-------------|------------|
| `vpc_id` | string | Yes | - | VPC from networking module | - |
| `subnet_ids` | list(string) | Yes | - | Subnets for instances | - |
| `security_group_ids` | list(string) | Yes | - | Security groups to attach | - |
| `instance_type` | string | No | "t3.micro" | EC2 instance type | Valid instance type |
| `ami_id` | string | No | null | AMI ID (latest Amazon Linux 2 if null) | - |
| `key_name` | string | No | null | SSH key pair name | - |
| `min_size` | number | No | 1 | Minimum ASG size | >= 0 |
| `max_size` | number | No | 3 | Maximum ASG size | >= min_size |
| `desired_capacity` | number | No | 1 | Desired ASG capacity | Between min and max |
| `health_check_type` | string | No | "ELB" | Health check type | EC2 or ELB |
| `user_data` | string | No | "" | Instance user data script | - |

### Output Values

| Output | Type | Description | Consumers |
|--------|------|-------------|-----------|
| `asg_name` | string | Auto Scaling Group name | load-balancing, monitoring |
| `asg_arn` | string | Auto Scaling Group ARN | load-balancing |
| `launch_template_id` | string | Launch template ID | - |
| `instance_role_arn` | string | IAM role ARN for instances | - |
| `instance_role_name` | string | IAM role name for instances | - |

## Module: database

Manages RDS instances and related configurations.

### Input Variables

| Variable | Type | Required | Default | Description | Validation |
|----------|------|----------|---------|-------------|------------|
| `vpc_id` | string | Yes | - | VPC from networking module | - |
| `subnet_ids` | list(string) | Yes | - | Subnets for RDS (private) | Min 2 subnets |
| `security_group_ids` | list(string) | Yes | - | Security groups for RDS | - |
| `engine` | string | No | "postgres" | Database engine | postgres, mysql |
| `engine_version` | string | No | "15" | Engine version | - |
| `instance_class` | string | No | "db.t3.micro" | RDS instance class | Valid instance class |
| `allocated_storage` | number | No | 20 | Storage in GB | 20-65536 |
| `database_name` | string | Yes | - | Initial database name | - |
| `master_username` | string | Yes | - | Master username | - |
| `master_password_secret_id` | string | Yes | - | Secrets Manager secret ID | - |
| `multi_az` | bool | No | false | Enable Multi-AZ | - |
| `backup_retention_period` | number | No | 7 | Backup retention days | 0-35 |
| `deletion_protection` | bool | No | true | Prevent accidental deletion | - |

### Output Values

| Output | Type | Description | Consumers |
|--------|------|-------------|-----------|
| `endpoint` | string | RDS endpoint address | Application configuration |
| `port` | number | RDS port | Application configuration |
| `database_name` | string | Database name | Application configuration |
| `db_instance_id` | string | RDS instance identifier | Monitoring |
| `db_subnet_group_name` | string | DB subnet group name | - |

## Module: storage

Manages S3 buckets with appropriate policies.

### Input Variables

| Variable | Type | Required | Default | Description | Validation |
|----------|------|----------|---------|-------------|------------|
| `bucket_name` | string | Yes | - | S3 bucket name | Globally unique |
| `versioning_enabled` | bool | No | true | Enable versioning | - |
| `lifecycle_rules` | list(object) | No | [] | Lifecycle rules | - |
| `cors_rules` | list(object) | No | [] | CORS configuration | - |
| `block_public_access` | bool | No | true | Block all public access | - |
| `encryption_configuration` | object | No | {sse_algorithm = "AES256"} | Encryption settings | - |

### Output Values

| Output | Type | Description | Consumers |
|--------|------|-------------|-----------|
| `bucket_id` | string | S3 bucket name | Application configuration |
| `bucket_arn` | string | S3 bucket ARN | IAM policies |
| `bucket_regional_domain_name` | string | Regional domain name | CloudFront, etc. |

## Module: load-balancing

Manages Application Load Balancers and Network Load Balancers.

### Input Variables

| Variable | Type | Required | Default | Description | Validation |
|----------|------|----------|---------|-------------|------------|
| `vpc_id` | string | Yes | - | VPC from networking module | - |
| `subnet_ids` | list(string) | Yes | - | Subnets for ALB (public) | Min 2 subnets |
| `security_group_ids` | list(string) | Yes | - | Security groups for ALB | - |
| `lb_type` | string | No | "application" | Load balancer type | application, network |
| `internal` | bool | No | false | Internal or internet-facing | - |
| `certificate_arn` | string | No | null | ACM certificate ARN | - |
| `target_groups` | list(object) | Yes | - | Target group configurations | - |
| `listeners` | list(object) | Yes | - | Listener configurations | - |
| `health_check` | object | No | {...} | Health check settings | - |

### Output Values

| Output | Type | Description | Consumers |
|--------|------|-------------|-----------|
| `lb_arn` | string | Load balancer ARN | - |
| `lb_dns_name` | string | Load balancer DNS name | dns module |
| `lb_zone_id` | string | Canonical hosted zone ID | dns module |
| `target_group_arns` | map(string) | Target group ARNs | compute (ASG attachment) |

## Module: dns

Manages Route53 zones and records.

### Input Variables

| Variable | Type | Required | Default | Description | Validation |
|----------|------|----------|---------|-------------|------------|
| `zone_name` | string | Yes | - | Domain name | Valid domain |
| `create_zone` | bool | No | false | Create new zone or use existing | - |
| `zone_id` | string | No | null | Existing zone ID (if not creating) | - |
| `records` | list(object) | No | [] | DNS records to create | - |
| `alias_records` | list(object) | No | [] | Alias records (for ALB) | - |

### Output Values

| Output | Type | Description | Consumers |
|--------|------|-------------|-----------|
| `zone_id` | string | Route53 zone ID | - |
| `zone_name` | string | Zone domain name | - |
| `name_servers` | list(string) | Zone name servers | Domain registrar |
| `record_fqdns` | map(string) | Created record FQDNs | Application configuration |

## Environment Variable Schema

Each environment (`dev`, `staging`, `prod`) uses the same variable schema with different values:

```hcl
# terraform.tfvars schema

# General
environment = "dev"  # dev | staging | prod
project     = "shannon"
aws_region  = "us-east-1"

# Networking
vpc_cidr               = "10.0.0.0/16"
enable_nat_gateway     = true
single_nat_gateway     = true

# Compute
instance_type    = "t3.micro"
min_asg_size     = 1
max_asg_size     = 3
desired_capacity = 1

# Database
db_instance_class       = "db.t3.micro"
db_allocated_storage    = 20
db_multi_az             = false
db_backup_retention     = 7

# Storage
bucket_versioning = true

# Load Balancing
lb_internal = false

# DNS
domain_name = "shannon-dev.example.com"
```

## State Dependencies

The Terraform state for each module is independent but values flow between modules at apply time:

```
bootstrap (one-time) → creates S3 bucket for state
      │
      ▼
networking → vpc_id, subnet_ids, security_group_ids
      │
      ├──────────────────┬──────────────────┐
      ▼                  ▼                  ▼
  compute            database           storage
      │
      ▼
load-balancing → lb_dns_name, lb_zone_id
      │
      ▼
    dns
```

## Validation Rules Summary

| Module | Variable | Rule |
|--------|----------|------|
| All | environment | Must be dev, staging, or prod |
| networking | vpc_cidr | Valid CIDR notation |
| networking | availability_zones | Minimum 2 AZs |
| compute | min_size | >= 0 |
| compute | max_size | >= min_size |
| database | allocated_storage | 20-65536 GB |
| database | backup_retention_period | 0-35 days |
| load-balancing | lb_type | application or network |
