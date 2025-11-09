output "mysql_rds_endpoint" {
  description = "MySQL Aurora cluster endpoint"
  value       = var.create_mysql_rds ? aws_rds_cluster.mysql[0].endpoint : null
}

output "mysql_rds_reader_endpoint" {
  description = "MySQL Aurora cluster reader endpoint"
  value       = var.create_mysql_rds ? aws_rds_cluster.mysql[0].reader_endpoint : null
}

output "mysql_rds_username" {
  description = "MySQL Aurora master username"
  value       = var.create_mysql_rds ? aws_rds_cluster.mysql[0].master_username : null
}

output "mysql_rds_password" {
  description = "MySQL Aurora master password"
  value       = var.create_mysql_rds ? "password1234" : null
}

output "mysql_connection_command" {
  description = "MySQL connection command"
  value       = var.create_mysql_rds ? "mysql -h ${aws_rds_cluster.mysql[0].endpoint} -u ${aws_rds_cluster.mysql[0].master_username} -p" : null
}

output "postgres_rds_endpoint" {
  description = "PostgreSQL Aurora cluster endpoint"
  value       = var.create_postgres_rds ? aws_rds_cluster.postgres[0].endpoint : null
}

output "postgres_rds_reader_endpoint" {
  description = "PostgreSQL Aurora cluster reader endpoint"
  value       = var.create_postgres_rds ? aws_rds_cluster.postgres[0].reader_endpoint : null
}

output "postgres_rds_username" {
  description = "PostgreSQL Aurora master username"
  value       = var.create_postgres_rds ? aws_rds_cluster.postgres[0].master_username : null
}

output "postgres_rds_password" {
  description = "PostgreSQL Aurora master password"
  value       = var.create_postgres_rds ? "password1234" : null
}

output "postgres_connection_command" {
  description = "PostgreSQL connection command"
  value       = var.create_postgres_rds ? "psql -h ${aws_rds_cluster.postgres[0].endpoint} -U ${aws_rds_cluster.postgres[0].master_username} -d testdb" : null
}

output "s3_bucket_name" {
  description = "S3 bucket name for backups"
  value       = aws_s3_bucket.backup.id
}

output "iam_role_arn" {
  description = "IAM role ARN for RDS S3 import"
  value       = aws_iam_role.rds_s3_import.arn
}

output "mysql_security_group_id" {
  description = "Security group ID for Aurora MySQL"
  value       = aws_security_group.aurora_mysql.id
}

output "postgres_security_group_id" {
  description = "Security group ID for Aurora PostgreSQL"
  value       = aws_security_group.aurora_postgres.id
}

# output "my_ip" {
#   description = "Your current IP address"
#   value       = chomp(data.http.my_ip.response_body)
# }

output "db_subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.aurora.name
}

output "cluster_parameter_group_name" {
  description = "DB cluster parameter group name"
  value       = aws_rds_cluster_parameter_group.aurora_mysql.name
}
