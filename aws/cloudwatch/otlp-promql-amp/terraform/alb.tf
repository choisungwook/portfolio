data "http" "my_ip" {
  count = local.ecs_grafana ? 1 : 0

  url = "https://api.ipify.org?format=text"
}

resource "aws_security_group" "alb" {
  count = local.ecs_grafana ? 1 : 0

  name        = "${var.project_name}-alb"
  description = "Grafana ALB, practitioner IP only"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_my_ip" {
  count = local.ecs_grafana ? 1 : 0

  security_group_id = aws_security_group.alb[0].id
  cidr_ipv4         = "${chomp(data.http.my_ip[0].response_body)}/32"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_to_grafana" {
  count = local.ecs_grafana ? 1 : 0

  security_group_id            = aws_security_group.alb[0].id
  referenced_security_group_id = aws_security_group.grafana[0].id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_security_group" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  name        = "${var.project_name}-grafana"
  description = "Grafana task"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "grafana_from_alb" {
  count = local.ecs_grafana ? 1 : 0

  security_group_id            = aws_security_group.grafana[0].id
  referenced_security_group_id = aws_security_group.alb[0].id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

# plugin 설치와 AWS API 호출에 쓴다.
resource "aws_vpc_security_group_egress_rule" "grafana_all" {
  count = local.ecs_grafana ? 1 : 0

  security_group_id = aws_security_group.grafana[0].id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_lb" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  name               = "${var.project_name}-grafana"
  load_balancer_type = "application"
  subnets            = data.aws_subnets.default.ids
  security_groups    = [aws_security_group.alb[0].id]
}

resource "aws_lb_target_group" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  name        = "${var.project_name}-grafana"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.default.id

  health_check {
    path = "/api/health"
  }
}

resource "aws_lb_listener" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  load_balancer_arn = aws_lb.grafana[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.grafana[0].arn
  }
}
