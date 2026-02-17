# =============================================================================
# ALB 1: EC2 nginx (온프레미스 nginx 시뮬레이션)
# =============================================================================

resource "aws_lb" "nginx" {
  name               = "${var.project_name}-nginx-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_nginx.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "nginx" {
  name     = "${var.project_name}-nginx-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }
}

resource "aws_lb_target_group_attachment" "nginx" {
  target_group_arn = aws_lb_target_group.nginx.arn
  target_id        = aws_instance.nginx.id
  port             = 80
}

resource "aws_lb_listener" "nginx_http" {
  load_balancer_arn = aws_lb.nginx.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nginx.arn
  }
}
