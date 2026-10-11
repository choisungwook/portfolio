resource "aws_lb" "web" {
  name               = var.project_name
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-web"
  port        = 80
  protocol    = "HTTP"
  target_type = "ip" # Fargate awsvpc tasks register by ENI IP
  vpc_id      = data.aws_vpc.default.id

  # Default is 300s. Short so scale-in draining is observable within the hands-on.
  deregistration_delay = 10

  health_check {
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
