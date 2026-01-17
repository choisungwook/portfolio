resource "aws_db_subnet_group" "postgres" {
  name       = "${var.project_name}-postgres"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

resource "aws_rds_cluster" "postgres" {
  cluster_identifier = "${var.project_name}-postgres"
  engine             = "aurora-postgresql"
  engine_version     = var.aurora_postgres_engine_version
  database_name      = var.db_name
  master_username    = var.db_master_username
  master_password    = var.db_master_password

  db_subnet_group_name                = aws_db_subnet_group.postgres.name
  vpc_security_group_ids              = [aws_security_group.aurora_postgres.id]
  iam_database_authentication_enabled = true

  skip_final_snapshot = true
  apply_immediately   = true

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

resource "aws_rds_cluster_instance" "postgres" {
  identifier         = "${var.project_name}-postgres-1"
  cluster_identifier = aws_rds_cluster.postgres.id
  instance_class     = var.aurora_instance_class
  engine             = aws_rds_cluster.postgres.engine
  engine_version     = aws_rds_cluster.postgres.engine_version

  publicly_accessible = true

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = {
    Name = "${var.project_name}-postgres-1"
  }
}
