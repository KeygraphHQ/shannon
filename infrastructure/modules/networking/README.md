# Networking Module

Creates VPC infrastructure including subnets, gateways, route tables, and security groups.

## Usage

```hcl
module "networking" {
  source = "../../modules/networking"

  environment          = "dev"
  project              = "shannon"
  vpc_cidr             = "10.0.0.0/16"
  availability_zones   = ["us-east-1a", "us-east-1b"]
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24"]
  enable_nat_gateway   = true
  single_nat_gateway   = true  # Use false for prod (one per AZ)
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| environment | Environment name (dev, staging, prod) | `string` | n/a | yes |
| project | Project identifier | `string` | `"shannon"` | no |
| vpc_cidr | CIDR block for the VPC | `string` | `"10.0.0.0/16"` | no |
| availability_zones | List of availability zones | `list(string)` | `["us-east-1a", "us-east-1b"]` | no |
| public_subnet_cidrs | CIDR blocks for public subnets | `list(string)` | `["10.0.1.0/24", "10.0.2.0/24"]` | no |
| private_subnet_cidrs | CIDR blocks for private subnets | `list(string)` | `["10.0.10.0/24", "10.0.20.0/24"]` | no |
| enable_nat_gateway | Enable NAT Gateway | `bool` | `true` | no |
| single_nat_gateway | Use single NAT Gateway | `bool` | `true` | no |
| tags | Additional resource tags | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| vpc_id | ID of the VPC |
| vpc_cidr | CIDR block of the VPC |
| public_subnet_ids | IDs of public subnets |
| private_subnet_ids | IDs of private subnets |
| nat_gateway_ips | Elastic IPs of NAT Gateways |
| app_security_group_id | Security group ID for app servers |
| db_security_group_id | Security group ID for databases |
| alb_security_group_id | Security group ID for load balancers |

## Resources Created

- 1 VPC
- 2+ Public subnets (one per AZ)
- 2+ Private subnets (one per AZ)
- 1 Internet Gateway
- 1-2 NAT Gateways (depending on single_nat_gateway)
- 1-2 Elastic IPs for NAT
- Route tables for public and private subnets
- 3 Security groups (ALB, App, DB)

## Security Groups

| Name | Purpose | Inbound Rules |
|------|---------|---------------|
| ALB | Load balancer | HTTP/HTTPS from anywhere |
| App | Application servers | HTTP/HTTPS from ALB, SSH from VPC |
| DB | Databases | PostgreSQL/MySQL from App |
