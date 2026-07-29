resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb"
  description = "ALB for akbun-terraform-apply-remote"
  vpc_id      = data.aws_vpc.default.id
}

# GitHub webhook 발신 IP 대역은 수시로 바뀌므로 전체 공개로 두고,
# 요청 인증은 서버의 HMAC-SHA256 서명 검증에 맡긴다.
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "GitHub webhook deliveries"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_redirect" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP to HTTPS redirect"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to service tasks"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "service" {
  name        = "${var.project_name}-service"
  description = "akbun-terraform-apply-remote tasks"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "service_from_alb" {
  security_group_id            = aws_security_group.service.id
  description                  = "Webhook traffic from the ALB only"
  from_port                    = var.server_port
  to_port                      = var.server_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "service_all" {
  security_group_id = aws_security_group.service.id
  description       = "GitHub API, git clone, terraform providers, EFS"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "efs" {
  name        = "${var.project_name}-efs"
  description = "EFS for akbun-terraform-apply-remote state"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "efs_from_service" {
  security_group_id            = aws_security_group.efs.id
  description                  = "NFS from service tasks only"
  from_port                    = 2049
  to_port                      = 2049
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.service.id
}
