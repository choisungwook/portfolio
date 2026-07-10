output "elasticache_primary_endpoint" {
  description = "Primary endpoint passed to ELASTICACHE_ENDPOINT"
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "elasticache_replication_group_id" {
  description = "Replication group ID used as the IAM token signing host, passed to ELASTICACHE_CACHE_NAME"
  value       = aws_elasticache_replication_group.this.replication_group_id
}

output "elasticache_iam_user" {
  description = "ElastiCache RBAC user (authentication_mode iam) passed to ELASTICACHE_IAM_USER. This is an ElastiCache user, not an AWS IAM user."
  value       = var.elasticache_iam_user_name
}

output "aws_region" {
  description = "AWS Region passed to the IAM token signer"
  value       = var.aws_region
}

output "app_instance_id" {
  description = "EC2 instance ID of the app host; connect with aws ssm start-session"
  value       = aws_instance.app.id
}
