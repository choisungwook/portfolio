# Remote access is SSM Session Manager, so nothing opens port 22 and no rule
# accepts traffic from the internet. Every ingress rule below exists only so the
# two lab flows can be observed.
resource "aws_security_group" "a_lab" {
  name        = "${var.project_name}-a-lab"
  description = "Lab hosts in the client VPC"
  vpc_id      = aws_vpc.a.id

  tags = {
    Name = "${var.project_name}-a-lab"
  }
}

resource "aws_vpc_security_group_ingress_rule" "a_lab_http" {
  security_group_id = aws_security_group.a_lab.id
  description       = "HTTP test port from inside the client VPC"
  cidr_ipv4         = var.vpc_a_cidr
  from_port         = 8080
  ip_protocol       = "tcp"
  to_port           = 8080
}

resource "aws_vpc_security_group_ingress_rule" "a_lab_icmp" {
  security_group_id = aws_security_group.a_lab.id
  description       = "ICMP from inside the client VPC"
  cidr_ipv4         = var.vpc_a_cidr
  ip_protocol       = "icmp"
  from_port         = -1
  to_port           = -1
}

resource "aws_vpc_security_group_egress_rule" "a_lab_all" {
  security_group_id = aws_security_group.a_lab.id
  description       = "All egress"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "b_server" {
  name        = "${var.project_name}-b-server"
  description = "Server in the peer VPC"
  vpc_id      = aws_vpc.b.id

  tags = {
    Name = "${var.project_name}-b-server"
  }
}

# Both source CIDRs are allowed on purpose. The lab must fail on routing, not on
# a security group, so the direct path and the NAT path are equally permitted.
resource "aws_vpc_security_group_ingress_rule" "b_server_http_direct" {
  security_group_id = aws_security_group.b_server.id
  description       = "HTTP test port from the client VPC primary CIDR"
  cidr_ipv4         = var.vpc_a_cidr
  from_port         = 8080
  ip_protocol       = "tcp"
  to_port           = 8080
}

resource "aws_vpc_security_group_ingress_rule" "b_server_http_nat" {
  security_group_id = aws_security_group.b_server.id
  description       = "HTTP test port from the private NAT CIDR"
  cidr_ipv4         = var.vpc_a_secondary_cidr
  from_port         = 8080
  ip_protocol       = "tcp"
  to_port           = 8080
}

resource "aws_vpc_security_group_ingress_rule" "b_server_icmp_direct" {
  security_group_id = aws_security_group.b_server.id
  description       = "ICMP from the client VPC primary CIDR"
  cidr_ipv4         = var.vpc_a_cidr
  ip_protocol       = "icmp"
  from_port         = -1
  to_port           = -1
}

resource "aws_vpc_security_group_ingress_rule" "b_server_icmp_nat" {
  security_group_id = aws_security_group.b_server.id
  description       = "ICMP from the private NAT CIDR"
  cidr_ipv4         = var.vpc_a_secondary_cidr
  ip_protocol       = "icmp"
  from_port         = -1
  to_port           = -1
}

resource "aws_vpc_security_group_egress_rule" "b_server_all" {
  security_group_id = aws_security_group.b_server.id
  description       = "All egress"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
