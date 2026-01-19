# Staging Environment Backend Configuration
# Purpose: Configure S3 remote state backend for staging
# Note: Run bootstrap module first to create the S3 bucket and DynamoDB table

terraform {
  backend "s3" {
    bucket         = "shannon-terraform-state"
    key            = "environments/staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "shannon-terraform-locks"
  }
}
