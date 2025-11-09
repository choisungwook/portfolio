resource "random_password" "src_master" {
  length  = 12
  special = false
}

resource "random_password" "dst_master" {
  length  = 12
  special = false
}

resource "aws_db_subnet_group" "aurora" {
  name       = "aurora-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "aurora-subnet-group"
  }
}

# src Aurora Cluster
resource "aws_rds_cluster" "src" {
  cluster_identifier              = "src-aurora-cluster"
  engine                          = "aurora-mysql"
  engine_version                  = var.aurora_engine_version
  database_name                   = "testdb"
  master_username                 = "admin"
  master_password                 = random_password.src_master.result
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.aurora.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora_mysql.name
  skip_final_snapshot             = true
  storage_encrypted               = true
  iam_roles                       = [aws_iam_role.rds_s3_import.arn]
  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]

  availability_zones = [
    "${var.region}a",
    "${var.region}c",
    "${var.region}b"
  ]

  tags = {
    Name = "src-aurora-cluster"
  }
}

resource "aws_rds_cluster_instance" "src" {
  identifier          = "src-aurora-instance"
  cluster_identifier  = aws_rds_cluster.src.id
  instance_class      = var.rds_instance_class
  engine              = aws_rds_cluster.src.engine
  engine_version      = aws_rds_cluster.src.engine_version
  publicly_accessible = true

  tags = {
    Name = "src-aurora-instance"
  }
}

# dst Aurora Cluster
resource "aws_rds_cluster" "dst" {
  cluster_identifier              = "dst-aurora-cluster"
  engine                          = "aurora-mysql"
  engine_version                  = var.aurora_engine_version
  database_name                   = "testdb"
  master_username                 = "admin"
  master_password                 = random_password.dst_master.result
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.aurora.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora_mysql.name
  skip_final_snapshot             = true
  storage_encrypted               = true
  iam_roles                       = [aws_iam_role.rds_s3_import.arn]
  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]

  availability_zones = [
    "${var.region}a",
    "${var.region}c",
    "${var.region}b"
  ]

  tags = {
    Name = "dst-aurora-cluster"
  }
}

resource "aws_rds_cluster_instance" "dst" {
  identifier          = "dst-aurora-instance"
  cluster_identifier  = aws_rds_cluster.dst.id
  instance_class      = var.rds_instance_class
  engine              = aws_rds_cluster.dst.engine
  engine_version      = aws_rds_cluster.dst.engine_version
  publicly_accessible = true

  tags = {
    Name = "dst-aurora-instance"
  }
}
