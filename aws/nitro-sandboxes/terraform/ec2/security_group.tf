resource "aws_security_group" "parent" {
  name        = "${var.project_name}-parent"
  description = "SSH from my IP only"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "ssh_from_my_ip" {
  security_group_id = aws_security_group.parent.id
  cidr_ipv4         = local.my_ip_cidr
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

# Firecracker 다운로드와 dnf 설치에 필요하다
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.parent.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
