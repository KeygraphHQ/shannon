# Dev Environment Values
# Purpose: Development-specific variable values

environment = "dev"
project     = "shannon"
aws_region  = "us-east-1"

# Networking - Dev uses smaller, cost-effective settings
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b"]
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24"]
enable_nat_gateway   = true
single_nat_gateway   = true  # Cost saving: single NAT for dev

# Compute - Smallest instance sizes for dev
instance_type    = "t3.micro"
min_asg_size     = 1
max_asg_size     = 2
desired_capacity = 1

# Database - Minimal config for dev
db_instance_class    = "db.t3.micro"
db_allocated_storage = 20
db_multi_az          = false  # No multi-AZ for dev

# Tags
tags = {
  Owner       = "platform-team"
  CostCenter  = "engineering"
}
