resource "aws_rds_cluster_parameter_group" "aurora_mysql" {
  name        = "aurora-mysql-pitr-parameter-group"
  family      = "aurora-mysql8.0"
  description = "Aurora MySQL parameter group for PITR hands-on"

  # Enable binary logging for PITR
  parameter {
    name         = "binlog_format"
    value        = "ROW"
    apply_method = "pending-reboot"
  }

  tags = {
    Name = "aurora-mysql-pitr-parameter-group"
  }
}
