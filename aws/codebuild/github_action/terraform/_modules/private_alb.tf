resource "aws_security_group" "private_alb" {
  name        = "${var.name_prefix}-private-alb-sg"
  description = "Security group for Private ALB"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-alb-sg"
    }
  )
}

resource "aws_vpc_security_group_ingress_rule" "private_alb_https" {
  security_group_id = aws_security_group.private_alb.id
  description       = "Allow HTTPS from VPC"
  cidr_ipv4         = var.vpc_cidr
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"

  tags = {
    Name = "private-alb-https"
  }
}

resource "aws_vpc_security_group_egress_rule" "private_alb_all" {
  security_group_id = aws_security_group.private_alb.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "private-alb-egress-all"
  }
}

resource "aws_lb" "nexus_private" {
  name               = "${var.name_prefix}-nexus-private-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.private_alb.id]
  subnets            = var.private_subnets

  enable_deletion_protection = false

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-private-alb"
    }
  )
}

resource "aws_lb_target_group" "nexus_private" {
  name     = "${var.name_prefix}-nexus-private-tg"
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
      Name = "${var.name_prefix}-nexus-private-tg"
    }
  )
}

resource "aws_lb_target_group_attachment" "nexus_private" {
  target_group_arn = aws_lb_target_group.nexus_private.arn
  target_id        = aws_instance.nexus.id
  port             = 8081
}

resource "aws_lb_listener" "nexus_private_https" {
  load_balancer_arn = aws_lb.nexus_private.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.private_acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nexus_private.arn
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-private-listener"
    }
  )
}
