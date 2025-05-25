resource "aws_rds_cluster" "aurora_cluster" {
  cluster_identifier     = var.rds_cluster_identifier
  engine                 = var.rds_engine
  engine_version         = var.rds_engine_version
  database_name          = var.db_name
  master_username        = var.rds_username
  master_password        = var.rds_password
  skip_final_snapshot    = true
  db_subnet_group_name   = aws_db_subnet_group.rds_subnet_group.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  storage_encrypted      = var.rds_storage_encrypted
  # backup_retention_period = 7 # Optional: configure backups
  # preferred_backup_window = "07:00-09:00" # Optional

  tags = var.common_tags
}

resource "aws_rds_cluster_instance" "writer" {
  identifier           = "${var.rds_cluster_identifier}-writer"
  cluster_identifier   = aws_rds_cluster.aurora_cluster.id
  instance_class       = var.rds_instance_class
  engine               = var.rds_engine
  engine_version       = var.rds_engine_version
  publicly_accessible  = false
  db_subnet_group_name = aws_db_subnet_group.rds_subnet_group.name
  # ca_cert_identifier      = "rds-ca-2019" # Or the latest appropriate CA cert

  tags = var.common_tags
}

resource "aws_db_subnet_group" "rds_subnet_group" {
  name       = "${var.environment_name}-rds-subnet-group"
  subnet_ids = module.vpc.private_subnets_ids

  tags = merge(
    var.common_tags,
    {
      Name = "${var.environment_name}-rds-subnet-group"
    }
  )
}

resource "aws_security_group" "rds_sg" {
  name        = "${var.environment_name}-rds-sg"
  description = "Security group for RDS Aurora cluster"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = var.rds_db_port
    to_port     = var.rds_db_port
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = var.common_tags
}

resource "aws_security_group" "lambda_sg" {
  name        = "${var.environment_name}-lambda-sg"
  description = "Security group for Lambda function"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.common_tags
}
