resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb"
  description = "Internet-facing ALB restricted to the operator IP"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.project_name}-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_from_my_ip" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from the operator IP only"
  cidr_ipv4         = "${chomp(data.http.my_ip.response_body)}/32"
  from_port         = 80
  ip_protocol       = "tcp"
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "All outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "App instances reachable only from the ALB"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "App port from the ALB security group"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8080
  ip_protocol                  = "tcp"
  to_port                      = 8080
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "All outbound (SSM, package installs)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
