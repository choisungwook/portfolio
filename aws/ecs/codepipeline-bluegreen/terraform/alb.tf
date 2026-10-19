resource "aws_lb" "web" {
  name               = var.project_name
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

# blue/green은 target group 두 개를 번갈아 쓴다. 어느 쪽이 blue인지는 배포마다 바뀐다.
resource "aws_lb_target_group" "blue" {
  name        = "${var.project_name}-blue"
  port        = 80
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.default.id

  deregistration_delay = 10

  health_check {
    path     = "/"
    interval = 10
    timeout  = 5
  }
}

resource "aws_lb_target_group" "green" {
  name        = "${var.project_name}-green"
  port        = 80
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.default.id

  deregistration_delay = 10

  health_check {
    path     = "/"
    interval = 10
    timeout  = 5
  }
}

# ECS는 listener의 default action이 아니라 listener rule의 forward를 바꾼다. 그래서 default는 404로 두고 rule에 라우팅을 건다.
resource "aws_lb_listener" "production" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "no rule matched"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "test" {
  load_balancer_arn = aws_lb.web.arn
  port              = var.test_listener_port
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "no rule matched"
      status_code  = "404"
    }
  }
}

# 배포가 끝나면 ECS가 forward 대상을 다른 target group으로 바꾼다. terraform이 되돌리면 트래픽이 죽은 쪽으로 간다.
resource "aws_lb_listener_rule" "production" {
  listener_arn = aws_lb_listener.production.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }

  lifecycle {
    ignore_changes = [action]
  }
}

resource "aws_lb_listener_rule" "test" {
  listener_arn = aws_lb_listener.test.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }

  lifecycle {
    ignore_changes = [action]
  }
}
