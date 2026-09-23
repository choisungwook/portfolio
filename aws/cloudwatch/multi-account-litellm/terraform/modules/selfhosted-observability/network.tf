resource "aws_security_group" "alb" {
  name        = "${var.name}-grafana-alb"
  description = "Grafana ALB. only the lab user IP"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = var.allowed_cidr
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "tasks" {
  name        = "${var.name}-tasks"
  description = "VictoriaMetrics and Grafana tasks"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "grafana_from_alb" {
  security_group_id            = aws_security_group.tasks.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

# PrivateLink로 들어온 remote write는 NLB의 VPC 내부 IP에서 온다.
resource "aws_vpc_security_group_ingress_rule" "vm_from_vpc" {
  security_group_id = aws_security_group.tasks.id
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 8428
  to_port           = 8428
}

resource "aws_vpc_security_group_egress_rule" "tasks_all" {
  security_group_id = aws_security_group.tasks.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "efs" {
  name        = "${var.name}-efs"
  description = "EFS for VictoriaMetrics and Grafana"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "efs_from_tasks" {
  security_group_id            = aws_security_group.efs.id
  referenced_security_group_id = aws_security_group.tasks.id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
}

# ---------- Grafana 접속용 ALB ----------
resource "aws_lb" "grafana" {
  name               = "${var.name}-grafana"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids
}

resource "aws_lb_target_group" "grafana" {
  name        = "${var.name}-grafana"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path    = "/api/health"
    matcher = "200"
  }
}

resource "aws_lb_listener" "grafana" {
  load_balancer_arn = aws_lb.grafana.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.grafana.arn
  }
}

# ---------- remote write 수신용 NLB + PrivateLink ----------
# default VPC는 계정마다 CIDR(172.31.0.0/16)이 같아 VPC peering을 걸 수 없다. PrivateLink는 CIDR이 겹쳐도 된다.
resource "aws_lb" "remote_write" {
  name               = "${var.name}-rw"
  load_balancer_type = "network"
  internal           = true
  subnets            = var.subnet_ids
}

resource "aws_lb_target_group" "remote_write" {
  name        = "${var.name}-rw"
  port        = 8428
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    protocol = "HTTP"
    path     = "/health"
  }
}

resource "aws_lb_listener" "remote_write" {
  load_balancer_arn = aws_lb.remote_write.arn
  port              = 8428
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.remote_write.arn
  }
}

resource "aws_vpc_endpoint_service" "remote_write" {
  acceptance_required        = false
  network_load_balancer_arns = [aws_lb.remote_write.arn]
  allowed_principals         = [for account_id in var.source_account_ids : "arn:aws:iam::${account_id}:root"]
}

# ---------- 서비스 이름 ----------
resource "aws_service_discovery_private_dns_namespace" "monitoring" {
  name = local.namespace
  vpc  = var.vpc_id
}

resource "aws_service_discovery_service" "victoriametrics" {
  name = "victoriametrics"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.monitoring.id

    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}
