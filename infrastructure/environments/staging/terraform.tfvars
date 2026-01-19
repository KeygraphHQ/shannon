# Staging Environment Values
# Purpose: Staging-specific variable values (mirrors production config at smaller scale)

environment = "staging"
project     = "shannon"
aws_region  = "us-east-1"

# Networking - Staging mirrors prod structure but can use single NAT
vpc_cidr             = "10.1.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b"]
public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
private_subnet_cidrs = ["10.1.10.0/24", "10.1.20.0/24"]
enable_nat_gateway   = true
single_nat_gateway   = true  # Cost saving: single NAT for staging

# Compute - Medium instance sizes for staging
instance_type    = "t3.small"
min_asg_size     = 2
max_asg_size     = 4
desired_capacity = 2

# Database - Medium config for staging
db_instance_class    = "db.t3.small"
db_allocated_storage = 50
db_multi_az          = false  # No multi-AZ for staging (cost saving)

# Tags
tags = {
  Owner       = "platform-team"
  CostCenter  = "engineering"
}
