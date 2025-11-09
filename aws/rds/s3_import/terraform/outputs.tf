output "src_rds_endpoint" {
  description = "Source Aurora cluster endpoint"
  value       = aws_rds_cluster.src.endpoint
}

output "src_rds_reader_endpoint" {
  description = "Source Aurora cluster reader endpoint"
  value       = aws_rds_cluster.src.reader_endpoint
}

output "src_rds_password" {
  description = "Source Aurora master password"
  value       = random_password.src_master.result
  sensitive   = true
}

output "dst_rds_endpoint" {
  description = "Destination Aurora cluster endpoint"
  value       = aws_rds_cluster.dst.endpoint
}

output "dst_rds_reader_endpoint" {
  description = "Destination Aurora cluster reader endpoint"
  value       = aws_rds_cluster.dst.reader_endpoint
}

output "dst_rds_password" {
  description = "Destination Aurora master password"
  value       = random_password.dst_master.result
  sensitive   = true
}

output "s3_bucket_name" {
  description = "S3 bucket name for backups"
  value       = aws_s3_bucket.backup.id
}

output "iam_role_arn" {
  description = "IAM role ARN for RDS S3 import"
  value       = aws_iam_role.rds_s3_import.arn
}

output "security_group_id" {
  description = "Security group ID for Aurora"
  value       = aws_security_group.aurora.id
}

output "my_ip" {
  description = "Your current IP address"
  value       = chomp(data.http.my_ip.response_body)
}

output "db_subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.aurora.name
}

output "cluster_parameter_group_name" {
  description = "DB cluster parameter group name"
  value       = aws_rds_cluster_parameter_group.aurora_mysql.name
}
