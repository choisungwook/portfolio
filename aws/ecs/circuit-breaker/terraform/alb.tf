resource "aws_lb" "web" {
  name               = "${var.project_name}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

# Blue serves production first. ECS registers the new revision's tasks in the other group.
resource "aws_lb_target_group" "web" {
  for_each = toset(["blue", "green"])

  name        = "${var.project_name}-${each.key}"
  port        = 80
  protocol    = "HTTP"
  target_type = "ip" # Fargate awsvpc tasks register by ENI IP
  vpc_id      = data.aws_vpc.default.id

  # Default is 300s. Short so failed green tasks leave the group within the hands-on.
  deregistration_delay = 5

  health_check {
    path                = "/"
    interval            = 5
    timeout             = 2
    healthy_threshold   = 2
    unhealthy_threshold = 2
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  # Production traffic goes through the rule below. ECS shifts traffic by editing rule weights, not the default action.
  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "no matching rule"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "production" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  condition {
    path_pattern {
      values = ["/*"]
    }
  }

  action {
    type = "forward"

    forward {
      target_group {
        arn    = aws_lb_target_group.web["blue"].arn
        weight = 100
      }

      target_group {
        arn    = aws_lb_target_group.web["green"].arn
        weight = 0
      }
    }
  }

  # ECS owns the weights after the first apply. Without this, the next apply undoes a traffic shift.
  lifecycle {
    ignore_changes = [action]
  }
}
