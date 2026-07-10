output "elasticache_primary_endpoint" {
  description = "Primary endpoint passed to ELASTICACHE_ENDPOINT"
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "elasticache_replication_group_id" {
  description = "Replication group ID passed to ELASTICACHE_CACHE_NAME for IAM token signing"
  value       = aws_elasticache_replication_group.this.replication_group_id
}

output "elasticache_iam_user" {
  description = "ElastiCache IAM user passed to ELASTICACHE_IAM_USER"
  value       = var.iam_user_name
}

output "aws_region" {
  description = "AWS Region passed to the IAM token signer"
  value       = var.aws_region
}

output "app_instance_id" {
  description = "EC2 instance ID of the app host; connect with aws ssm start-session"
  value       = aws_instance.app.id
}
