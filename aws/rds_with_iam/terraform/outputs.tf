output "ec2_public_ip" {
  description = "EC2 instance public IP"
  value       = aws_instance.app.public_ip
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

output "ec2_ssm_command" {
  description = "Command to connect via SSM"
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.region}"
}

output "aurora_mysql_endpoint" {
  description = "Aurora MySQL cluster endpoint"
  value       = aws_rds_cluster.mysql.endpoint
}

output "aurora_mysql_reader_endpoint" {
  description = "Aurora MySQL reader endpoint"
  value       = aws_rds_cluster.mysql.reader_endpoint
}

output "aurora_mysql_resource_id" {
  description = "Aurora MySQL cluster resource ID"
  value       = aws_rds_cluster.mysql.cluster_resource_id
}

output "aurora_postgres_endpoint" {
  description = "Aurora PostgreSQL cluster endpoint"
  value       = aws_rds_cluster.postgres.endpoint
}

output "aurora_postgres_reader_endpoint" {
  description = "Aurora PostgreSQL reader endpoint"
  value       = aws_rds_cluster.postgres.reader_endpoint
}

output "aurora_postgres_resource_id" {
  description = "Aurora PostgreSQL cluster resource ID"
  value       = aws_rds_cluster.postgres.cluster_resource_id
}

output "iam_auth_token_mysql_command" {
  description = "Command to generate IAM auth token for MySQL"
  value       = "aws rds generate-db-auth-token --hostname ${aws_rds_cluster.mysql.endpoint} --port 3306 --region ${var.region} --username iam_user"
}

output "iam_auth_token_postgres_command" {
  description = "Command to generate IAM auth token for PostgreSQL"
  value       = "aws rds generate-db-auth-token --hostname ${aws_rds_cluster.postgres.endpoint} --port 5432 --region ${var.region} --username iam_user"
}
