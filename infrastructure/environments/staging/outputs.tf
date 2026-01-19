# Staging Environment Outputs
# Purpose: Expose resource identifiers for integration

# Networking outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.networking.vpc_id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = module.networking.vpc_cidr
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.networking.private_subnet_ids
}

output "nat_gateway_ips" {
  description = "NAT Gateway public IPs"
  value       = module.networking.nat_gateway_ips
}

output "app_security_group_id" {
  description = "Security group ID for app servers"
  value       = module.networking.app_security_group_id
}

output "db_security_group_id" {
  description = "Security group ID for databases"
  value       = module.networking.db_security_group_id
}

output "alb_security_group_id" {
  description = "Security group ID for load balancers"
  value       = module.networking.alb_security_group_id
}

# Environment info
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}
