# Bootstrap Outputs
# Purpose: Expose state backend identifiers for environment configuration

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

output "state_bucket_region" {
  description = "Region of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.state.region
}
