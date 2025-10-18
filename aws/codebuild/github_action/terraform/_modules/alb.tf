resource "aws_lb" "nexus" {
  name               = "${var.name_prefix}-nexus-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnets

  enable_deletion_protection = false

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-alb"
    }
  )
}

resource "aws_lb_target_group" "nexus" {
  name     = "${var.name_prefix}-nexus-tg"
  port     = 8081
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/"
    matcher             = "200,303"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-tg"
    }
  )
}

resource "aws_lb_target_group_attachment" "nexus" {
  target_group_arn = aws_lb_target_group.nexus.arn
  target_id        = aws_instance.nexus.id
  port             = 8081
}

resource "aws_lb_listener" "nexus_https" {
  load_balancer_arn = aws_lb.nexus.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nexus.arn
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-listener"
    }
  )
}
