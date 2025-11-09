resource "aws_rds_cluster_parameter_group" "aurora_mysql" {
  name   = "aurora-mysql-s3-import"
  family = "aurora-mysql8.0"

  parameter {
    name  = "aws_default_s3_role"
    value = aws_iam_role.rds_s3_import.arn
  }

  tags = {
    Name = "aurora-mysql-s3-import"
  }
}

resource "aws_rds_cluster_parameter_group" "aurora_postgres" {
  name   = "aurora-postgres-s3-import"
  family = "aurora-postgresql16"

  tags = {
    Name = "aurora-postgres-s3-import"
  }
}
