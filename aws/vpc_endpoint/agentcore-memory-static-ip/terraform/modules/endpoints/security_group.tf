resource "aws_security_group" "endpoint" {
  name_prefix = "${var.project_name}-endpoint-"
  description = "Interface endpoint ENIs: TCP 443 from listed client CIDRs and referencing SGs."
  vpc_id      = var.vpc_id
}
resource "aws_vpc_security_group_ingress_rule" "client" {
  for_each          = var.client_cidrs
  security_group_id = aws_security_group.endpoint.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
