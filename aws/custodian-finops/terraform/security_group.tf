resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "EC2 instances in the lab. SSM handles access, so there is no ingress."
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "Outbound for SSM agent and package updates"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds"
  description = "MySQL reachable only from the lab EC2 instances"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.project_name}-rds"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_app" {
  security_group_id            = aws_security_group.rds.id
  description                  = "MySQL from the app security group"
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 3306
  ip_protocol                  = "tcp"
  to_port                      = 3306
}
