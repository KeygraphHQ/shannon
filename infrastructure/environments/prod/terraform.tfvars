# Production Environment Values
# Purpose: Production-specific variable values (high availability, larger instances)

environment = "prod"
project     = "shannon"
aws_region  = "us-east-1"

# Networking - Production uses 3 AZs and multi-NAT for high availability
vpc_cidr             = "10.2.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
public_subnet_cidrs  = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
private_subnet_cidrs = ["10.2.10.0/24", "10.2.20.0/24", "10.2.30.0/24"]
enable_nat_gateway   = true
single_nat_gateway   = false  # HA: one NAT per AZ in production

# Compute - Larger instance sizes for production
instance_type    = "t3.medium"
min_asg_size     = 3
max_asg_size     = 10
desired_capacity = 3

# Database - Production config with Multi-AZ
db_instance_class      = "db.t3.medium"
db_allocated_storage   = 100
db_multi_az            = true   # High availability for production
db_deletion_protection = true   # Prevent accidental deletion

# Tags
tags = {
  Owner              = "platform-team"
  CostCenter         = "engineering"
  DataClassification = "confidential"
  Compliance         = "soc2"
}
