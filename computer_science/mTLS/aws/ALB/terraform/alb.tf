resource "aws_security_group" "alb" {
  name        = "mtls-alb-sg"
  description = "Security group for ALB"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name        = "mtls-alb-sg"
    environment = "test"
  }
}

resource "aws_security_group_rule" "alb_ingress" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_lb" "nginx" {
  name               = "mtls-nginx"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids

  tags = {
    Name        = "mtls-nginx"
    environment = "test"
  }
}

resource "aws_lb_listener" "nginx_https" {
  load_balancer_arn = aws_lb.nginx.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = data.aws_acm_certificate.my_acm[0].arn

  mutual_authentication {
    mode            = "verify"
    trust_store_arn = aws_lb_trust_store.client_ca.arn
  }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nginx.arn
  }

  tags = {
    Name        = "mtls-nginx-https"
    environment = "test"
  }
}

resource "aws_lb_target_group" "nginx" {
  name     = "mtls-nginx-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  tags = {
    Name        = "mtls-nginx-tg"
    environment = "test"
  }
}

resource "aws_lb_target_group_attachment" "web" {
  target_group_arn = aws_lb_target_group.nginx.arn
  target_id        = aws_instance.web_server.id
  port             = 80
}
