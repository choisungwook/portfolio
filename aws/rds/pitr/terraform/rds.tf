resource "random_id" "snapshot_suffix" {
  byte_length = 4
}

resource "aws_db_subnet_group" "aurora" {
  name       = "aurora-pitr-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "aurora-pitr-subnet-group"
  }
}

# MySQL Aurora Cluster with PITR Configuration
resource "aws_rds_cluster" "mysql" {
  cluster_identifier              = "mysql-aurora-pitr-cluster"
  engine                          = "aurora-mysql"
  engine_version                  = var.aurora_mysql_engine_version
  database_name                   = "pitrdb"
  master_username                 = "admin"
  master_password                 = "password1234"
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.aurora_mysql.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora_mysql.name

  # PITR Configuration
  # 이 값이 0보다 크면 자동 백업이 활성화됩니다.
  backup_retention_period = var.backup_retention_period

  # Other Configurations
  preferred_backup_window         = var.preferred_backup_window
  preferred_maintenance_window    = var.preferred_maintenance_window
  enabled_cloudwatch_logs_exports = var.enabled_cloudwatch_logs_exports
  copy_tags_to_snapshot           = var.copy_tags_to_snapshot
  deletion_protection             = var.deletion_protection

  # Snapshot Configuration
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.final_snapshot_identifier_prefix}-${random_id.snapshot_suffix.hex}"

  # Storage Configuration
  storage_encrypted = true

  # Apply changes immediately for hands-on purposes
  apply_immediately = true

  availability_zones = [
    "${var.region}a",
    "${var.region}c",
    "${var.region}b"
  ]

  tags = {
    Name        = "mysql-aurora-pitr-cluster"
    Environment = "hands-on"
    Feature     = "PITR"
  }
}

resource "aws_rds_cluster_instance" "mysql" {
  identifier                            = "mysql-aurora-pitr-instance"
  cluster_identifier                    = aws_rds_cluster.mysql.id
  instance_class                        = var.rds_instance_class
  engine                                = aws_rds_cluster.mysql.engine
  engine_version                        = aws_rds_cluster.mysql.engine_version
  publicly_accessible                   = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  apply_immediately                     = true

  tags = {
    Name        = "mysql-aurora-pitr-instance"
    Environment = "hands-on"
    Feature     = "PITR"
  }
}
