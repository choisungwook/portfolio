# default 버전 = AWS가 새 클러스터에 기본으로 쓰는 안정 버전
data "aws_rds_engine_version" "aurora_mysql" {
  engine       = "aurora-mysql"
  default_only = true
}

resource "aws_db_subnet_group" "aurora" {
  name       = var.project_name
  subnet_ids = data.aws_subnets.default.ids
}

# audit 로그로 어떤 DB 사용자가 접속했는지(CONNECT/FAILED_CONNECT)를 남긴다.
resource "aws_rds_cluster_parameter_group" "aurora" {
  name   = var.project_name
  family = data.aws_rds_engine_version.aurora_mysql.parameter_group_family

  parameter {
    name  = "server_audit_logging"
    value = "1"
  }

  parameter {
    name  = "server_audit_events"
    value = "CONNECT"
  }

  parameter {
    name  = "server_audit_excl_users"
    value = "rdsadmin"
  }
}

# RDS가 만드는 log group은 destroy 때 남으므로 미리 만들어 Terraform이 지우게 한다.
resource "aws_cloudwatch_log_group" "aurora" {
  for_each          = toset(["audit", "error", "iam-db-auth-error"])
  name              = "/aws/rds/cluster/${var.project_name}/${each.value}"
  retention_in_days = 1
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier = var.project_name
  engine             = "aurora-mysql"
  engine_version     = data.aws_rds_engine_version.aurora_mysql.version_actual
  engine_mode        = "provisioned"
  database_name      = var.db_name

  master_username             = "admin"
  manage_master_user_password = true # Secrets Manager + aws/secretsmanager 관리형 KMS 키

  iam_database_authentication_enabled = var.iam_auth_enabled

  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name
  enabled_cloudwatch_logs_exports = keys(aws_cloudwatch_log_group.aurora)

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_acu
    max_capacity = var.aurora_max_acu
  }

  storage_encrypted   = true
  skip_final_snapshot = true
  apply_immediately   = true
}

resource "aws_rds_cluster_instance" "writer" {
  identifier          = "${var.project_name}-writer"
  cluster_identifier  = aws_rds_cluster.aurora.id
  engine              = aws_rds_cluster.aurora.engine
  engine_version      = aws_rds_cluster.aurora.engine_version
  instance_class      = "db.serverless"
  publicly_accessible = true # 내 IP에서 직접 접속한다. 접근은 security group이 내 IP와 app으로 제한한다.

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
}
