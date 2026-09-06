resource "aws_security_group" "nlb" {
  name_prefix = "${var.project_name}-proxy-nlb-"
  vpc_id      = var.vpc_id
}
resource "aws_security_group" "proxy" {
  name_prefix = "${var.project_name}-proxy-"
  vpc_id      = var.vpc_id
}
resource "aws_vpc_security_group_ingress_rule" "client" {
  for_each          = var.client_cidrs
  security_group_id = aws_security_group.nlb.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_security_group_egress_rule" "nlb" {
  security_group_id            = aws_security_group.nlb.id
  referenced_security_group_id = aws_security_group.proxy.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}
resource "aws_vpc_security_group_ingress_rule" "proxy" {
  security_group_id            = aws_security_group.proxy.id
  referenced_security_group_id = aws_security_group.nlb.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}
resource "aws_vpc_security_group_egress_rule" "proxy" {
  security_group_id = aws_security_group.proxy.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_security_group_ingress_rule" "endpoint" {
  security_group_id            = var.endpoint_security_group_id
  referenced_security_group_id = aws_security_group.proxy.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}
