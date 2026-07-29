resource "aws_security_group" "server" {
  name        = var.project_name
  description = "akbun-terraform-apply-remote webhook server"
  vpc_id      = data.aws_vpc.default.id
}

# GitHub webhook 발신 IP 대역은 수시로 바뀌므로 전체 공개로 두고,
# 요청 인증은 HMAC-SHA256 서명 검증에 맡긴다. SSH(22)는 열지 않는다(SSM 사용).
resource "aws_vpc_security_group_ingress_rule" "webhook" {
  security_group_id = aws_security_group.server.id
  description       = "GitHub webhook deliveries"
  from_port         = var.server_port
  to_port           = var.server_port
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.server.id
  description       = "GitHub API, git clone, terraform providers"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
