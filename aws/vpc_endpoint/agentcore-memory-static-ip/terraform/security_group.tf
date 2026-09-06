resource "aws_security_group" "nlb" {
  name_prefix = "${var.project_name}-nlb-"
  description = "Public NLB TCP 443 ingress from the configured IPv4 source ranges."
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_security_group" "endpoint" {
  name_prefix = "${var.project_name}-endpoint-"
  description = "Only the NLBs can reach the interface endpoints."
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "client" {
  for_each          = var.allowed_client_cidrs
  security_group_id = aws_security_group.nlb.id
  cidr_ipv4         = each.key
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "nlb" {
  security_group_id            = aws_security_group.nlb.id
  referenced_security_group_id = aws_security_group.endpoint.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}

resource "aws_vpc_security_group_ingress_rule" "endpoint" {
  security_group_id            = aws_security_group.endpoint.id
  referenced_security_group_id = aws_security_group.nlb.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}
