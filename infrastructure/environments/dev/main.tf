# Dev Environment Main Configuration
# Purpose: Compose modules for development environment

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
      Project     = var.project
      ManagedBy   = "terraform"
    }
  }
}

#------------------------------------------------------------------------------
# Networking Module
#------------------------------------------------------------------------------

module "networking" {
  source = "../../modules/networking"

  environment          = var.environment
  project              = var.project
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  enable_nat_gateway   = var.enable_nat_gateway
  single_nat_gateway   = var.single_nat_gateway
  tags                 = var.tags
}

#------------------------------------------------------------------------------
# Future Modules (uncomment when implemented)
#------------------------------------------------------------------------------

# module "compute" {
#   source = "../../modules/compute"
#
#   environment        = var.environment
#   project            = var.project
#   vpc_id             = module.networking.vpc_id
#   subnet_ids         = module.networking.private_subnet_ids
#   security_group_ids = [module.networking.app_security_group_id]
#   instance_type      = var.instance_type
#   min_size           = var.min_asg_size
#   max_size           = var.max_asg_size
#   desired_capacity   = var.desired_capacity
#   tags               = var.tags
# }

# module "database" {
#   source = "../../modules/database"
#
#   environment        = var.environment
#   project            = var.project
#   vpc_id             = module.networking.vpc_id
#   subnet_ids         = module.networking.private_subnet_ids
#   security_group_ids = [module.networking.db_security_group_id]
#   instance_class     = var.db_instance_class
#   allocated_storage  = var.db_allocated_storage
#   multi_az           = var.db_multi_az
#   tags               = var.tags
# }
