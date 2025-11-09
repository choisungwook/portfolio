resource "aws_db_subnet_group" "aurora" {
  name       = "aurora-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "aurora-subnet-group"
  }
}

# MySQL Aurora Cluster
resource "aws_rds_cluster" "mysql" {
  count                           = var.create_mysql_rds ? 1 : 0
  cluster_identifier              = "mysql-aurora-cluster"
  engine                          = "aurora-mysql"
  engine_version                  = var.aurora_mysql_engine_version
  database_name                   = "testdb"
  master_username                 = "admin"
  master_password                 = "password1234"
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.aurora_mysql.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora_mysql.name
  skip_final_snapshot             = true
  storage_encrypted               = true
  iam_roles                       = [aws_iam_role.rds_s3_import.arn]
  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]
  apply_immediately               = true

  availability_zones = [
    "${var.region}a",
    "${var.region}c",
    "${var.region}b"
  ]

  tags = {
    Name = "mysql-aurora-cluster"
  }
}

resource "aws_rds_cluster_instance" "mysql" {
  count                                 = var.create_mysql_rds ? 1 : 0
  identifier                            = "mysql-aurora-instance"
  cluster_identifier                    = aws_rds_cluster.mysql[0].id
  instance_class                        = var.rds_instance_class
  engine                                = aws_rds_cluster.mysql[0].engine
  engine_version                        = aws_rds_cluster.mysql[0].engine_version
  publicly_accessible                   = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  apply_immediately                     = true

  tags = {
    Name = "mysql-aurora-instance"
  }
}

# PostgreSQL Aurora Cluster
resource "aws_rds_cluster" "postgres" {
  count                           = var.create_postgres_rds ? 1 : 0
  cluster_identifier              = "postgres-aurora-cluster"
  engine                          = "aurora-postgresql"
  engine_version                  = var.aurora_postgres_engine_version
  database_name                   = "testdb"
  master_username                 = "postgres"
  master_password                 = "password1234"
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.aurora_postgres.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora_postgres.name
  skip_final_snapshot             = true
  storage_encrypted               = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
  apply_immediately               = true

  availability_zones = [
    "${var.region}a",
    "${var.region}c",
    "${var.region}b"
  ]

  tags = {
    Name = "postgres-aurora-cluster"
  }
}

resource "aws_rds_cluster_role_association" "postgres_s3_import" {
  count                 = var.create_postgres_rds ? 1 : 0
  db_cluster_identifier = aws_rds_cluster.postgres[0].id
  feature_name          = "s3Import"
  role_arn              = aws_iam_role.rds_s3_import.arn
}

resource "aws_rds_cluster_role_association" "postgres_s3_export" {
  count                 = var.create_postgres_rds ? 1 : 0
  db_cluster_identifier = aws_rds_cluster.postgres[0].id
  feature_name          = "s3Export"
  role_arn              = aws_iam_role.rds_s3_export.arn
}

resource "aws_rds_cluster_instance" "postgres" {
  count                                 = var.create_postgres_rds ? 1 : 0
  identifier                            = "postgres-aurora-instance"
  cluster_identifier                    = aws_rds_cluster.postgres[0].id
  instance_class                        = var.rds_instance_class
  engine                                = aws_rds_cluster.postgres[0].engine
  engine_version                        = aws_rds_cluster.postgres[0].engine_version
  publicly_accessible                   = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  apply_immediately                     = true

  tags = {
    Name = "postgres-aurora-instance"
  }
}
