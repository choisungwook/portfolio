# No ingress. Access is through SSM Session Manager.
resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "App instances, egress only"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
