# Bootstrap Variables
# Purpose: Input variables for state backend infrastructure

variable "state_bucket_name" {
  description = "Name for the S3 bucket storing Terraform state"
  type        = string
  default     = "shannon-terraform-state"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.state_bucket_name))
    error_message = "Bucket name must be a valid S3 bucket name (lowercase, numbers, hyphens, periods)."
  }
}

variable "lock_table_name" {
  description = "Name for the DynamoDB table for state locking"
  type        = string
  default     = "shannon-terraform-locks"
}

variable "aws_region" {
  description = "AWS region for state resources"
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
