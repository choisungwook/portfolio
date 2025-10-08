# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${var.common_tags["Name"]}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = data.aws_vpc.default.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.common_tags["Name"]}-alb-sg"
    }
  )
}

resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${var.common_tags["Name"]}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.public.ids

  tags = merge(
    var.common_tags,
    {
      Name = "${var.common_tags["Name"]}-alb"
    }
  )
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  tags = var.common_tags
}

resource "aws_lb_target_group" "main" {
  name     = "${var.common_tags["Name"]}-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 15
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 2
    unhealthy_threshold = 2
  }

  deregistration_delay = 30

  tags = merge(
    var.common_tags,
    {
      Name = "${var.common_tags["Name"]}-tg"
    }
  )
}

# Outputs
output "alb_name" {
  description = "Name of the load balancer"
  value       = aws_lb.main.name
}

output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.main.arn
}

output "alb_security_group_id" {
  description = "Security group ID of the ALB"
  value       = aws_security_group.alb.id
}

output "vpc_id" {
  description = "VPC ID"
  value       = data.aws_vpc.default.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = data.aws_subnets.public.ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = data.aws_subnets.private.ids
}
