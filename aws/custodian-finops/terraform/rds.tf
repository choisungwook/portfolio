# An RDS instance nobody owns. It is the most expensive resource in the lab,
# which is exactly why it is the one worth catching.

resource "aws_db_subnet_group" "main" {
  count = var.create_rds ? 1 : 0

  name       = "${var.project_name}-db"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project_name}-db"
  }
}

resource "aws_db_instance" "main" {
  count = var.create_rds ? 1 : 0

  identifier     = "${var.project_name}-db"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  username                    = "admin"
  manage_master_user_password = true

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  skip_final_snapshot = true

  # No Owner tag, on purpose.
  tags = {
    Name = "${var.project_name}-db"
  }

  lifecycle {
    ignore_changes = [tags["c7n_tag_compliance"], tags["c7n_idle"]]
  }
}
