# SSM으로만 접속하므로 ingress는 열지 않는다
resource "aws_security_group" "selinux_lab" {
  name        = "${var.project_name}-sg"
  description = "egress only"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.selinux_lab.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
