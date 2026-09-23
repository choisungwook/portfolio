resource "aws_security_group" "collector" {
  name        = "${var.project_name}-collector"
  description = "metric collector"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "collector_all" {
  security_group_id = aws_security_group.collector.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "demo app exposing /metrics"
  vpc_id      = data.aws_vpc.default.id
}

# /metrics는 수집기에서만 연다.
resource "aws_vpc_security_group_ingress_rule" "app_from_collector" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.collector.id
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
}

# 기동할 때 pip로 prometheus-client를 받는다.
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
