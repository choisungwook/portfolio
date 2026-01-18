resource "aws_db_subnet_group" "mysql" {
  name       = "${var.project_name}-mysql"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project_name}-mysql"
  }
}

resource "aws_rds_cluster" "mysql" {
  cluster_identifier = "${var.project_name}-mysql"
  engine             = "aurora-mysql"
  engine_version     = var.aurora_mysql_engine_version
  database_name      = var.db_name
  master_username    = var.db_master_username
  master_password    = var.db_master_password

  db_subnet_group_name                = aws_db_subnet_group.mysql.name
  vpc_security_group_ids              = [aws_security_group.aurora_mysql.id]
  iam_database_authentication_enabled = true

  skip_final_snapshot = true
  apply_immediately   = true

  tags = {
    Name = "${var.project_name}-mysql"
  }
}

resource "aws_rds_cluster_instance" "mysql" {
  identifier         = "${var.project_name}-mysql-1"
  cluster_identifier = aws_rds_cluster.mysql.id
  instance_class     = var.aurora_instance_class
  engine             = aws_rds_cluster.mysql.engine
  engine_version     = aws_rds_cluster.mysql.engine_version

  publicly_accessible = true

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = {
    Name = "${var.project_name}-mysql-1"
  }
}
