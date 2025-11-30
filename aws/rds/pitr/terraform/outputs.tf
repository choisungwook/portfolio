output "mysql_rds_endpoint" {
  description = "MySQL Aurora cluster endpoint"
  value       = aws_rds_cluster.mysql.endpoint
}

output "mysql_rds_reader_endpoint" {
  description = "MySQL Aurora cluster reader endpoint"
  value       = aws_rds_cluster.mysql.reader_endpoint
}

output "mysql_rds_username" {
  description = "MySQL Aurora master username"
  value       = aws_rds_cluster.mysql.master_username
}

output "mysql_rds_password" {
  description = "MySQL Aurora master password"
  value       = "password1234"
  sensitive   = true
}

output "mysql_connection_command" {
  description = "MySQL connection command"
  value       = "mysql -h ${aws_rds_cluster.mysql.endpoint} -u ${aws_rds_cluster.mysql.master_username} -p"
}

output "cluster_identifier" {
  description = "RDS cluster identifier"
  value       = aws_rds_cluster.mysql.cluster_identifier
}

output "cluster_arn" {
  description = "RDS cluster ARN"
  value       = aws_rds_cluster.mysql.arn
}

# PITR Related Outputs
output "backup_retention_period" {
  description = "Number of days automated backups are retained"
  value       = aws_rds_cluster.mysql.backup_retention_period
}

output "preferred_backup_window" {
  description = "Daily time range during which automated backups are created"
  value       = aws_rds_cluster.mysql.preferred_backup_window
}

output "earliest_restorable_time" {
  description = "Earliest time to which a database can be restored with PITR"
  value       = aws_rds_cluster.mysql.backtrack_window
}

output "enabled_cloudwatch_logs" {
  description = "List of log types exported to CloudWatch Logs"
  value       = aws_rds_cluster.mysql.enabled_cloudwatch_logs_exports
}

output "security_group_id" {
  description = "Security group ID for Aurora MySQL"
  value       = aws_security_group.aurora_mysql.id
}

output "db_subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.aurora.name
}

output "cluster_parameter_group_name" {
  description = "DB cluster parameter group name"
  value       = aws_rds_cluster_parameter_group.aurora_mysql.name
}

# PITR Instructions
output "pitr_restore_instructions" {
  description = "Instructions for performing PITR restore"
  value       = <<-EOT
    To restore to a point in time using AWS CLI:

    aws rds restore-db-cluster-to-point-in-time \
      --source-db-cluster-identifier ${aws_rds_cluster.mysql.cluster_identifier} \
      --db-cluster-identifier mysql-aurora-pitr-restored \
      --restore-to-time "2024-01-01T12:00:00Z" \
      --region ${var.region}

    Or restore to latest restorable time:

    aws rds restore-db-cluster-to-point-in-time \
      --source-db-cluster-identifier ${aws_rds_cluster.mysql.cluster_identifier} \
      --db-cluster-identifier mysql-aurora-pitr-restored \
      --use-latest-restorable-time \
      --region ${var.region}
  EOT
}
