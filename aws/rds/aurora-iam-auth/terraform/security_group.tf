# EC2 app: 내 IP, Lambda prober, EC2 application status check만 app 포트에 접근한다.
resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "EC2 app"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "app_from_me" {
  for_each          = toset(local.allowed_cidrs)
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = each.value
  from_port         = var.app_port
  to_port           = var.app_port
  ip_protocol       = "tcp"
  description       = "my ip"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_prober" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.prober.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  description                  = "lambda prober"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_healthcheck" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.healthcheck.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  description                  = "ec2 application status check"
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Lambda prober: inbound 없음, app으로만 나간다.
resource "aws_security_group" "prober" {
  name        = "${var.project_name}-prober"
  description = "Lambda prober"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "prober_to_app" {
  security_group_id            = aws_security_group.prober.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
}

# EC2 application status check의 managed ENI가 쓰는 source security group.
resource "aws_security_group" "healthcheck" {
  name        = "${var.project_name}-healthcheck"
  description = "EC2 application status check source"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "healthcheck_to_app" {
  security_group_id            = aws_security_group.healthcheck.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
}

# Aurora: EC2 app과 내 IP만 3306에 접근한다.
resource "aws_security_group" "db" {
  name        = "${var.project_name}-db"
  description = "Aurora MySQL"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 3306
  to_port                      = 3306
  ip_protocol                  = "tcp"
  description                  = "ec2 app"
}

resource "aws_vpc_security_group_ingress_rule" "db_from_me" {
  for_each          = toset(local.allowed_cidrs)
  security_group_id = aws_security_group.db.id
  cidr_ipv4         = each.value
  from_port         = 3306
  to_port           = 3306
  ip_protocol       = "tcp"
  description       = "my ip"
}
