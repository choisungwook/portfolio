resource "aws_eip" "nlb" {
  for_each = var.scheme == "internet-facing" ? var.subnets : {}
  domain   = "vpc"
}
resource "aws_lb" "proxy" {
  name                             = "${var.project_name}-proxy"
  internal                         = var.scheme == "internal"
  load_balancer_type               = "network"
  ip_address_type                  = "ipv4"
  enable_cross_zone_load_balancing = true
  security_groups                  = [aws_security_group.nlb.id]
  dynamic "subnet_mapping" {
    for_each = var.subnets
    content {
      subnet_id            = subnet_mapping.value
      allocation_id        = var.scheme == "internet-facing" ? aws_eip.nlb[subnet_mapping.key].id : null
      private_ipv4_address = var.scheme == "internal" ? var.nlb_private_ips[subnet_mapping.key] : null
    }
  }
}
resource "aws_lb_target_group" "proxy" {
  name               = "${var.project_name}-proxy"
  vpc_id             = var.vpc_id
  target_type        = "instance"
  port               = 8080
  protocol           = "TCP"
  preserve_client_ip = false
  health_check { protocol = "TCP" }
}
resource "aws_lb_target_group_attachment" "proxy" {
  target_group_arn = aws_lb_target_group.proxy.arn
  target_id        = aws_instance.proxy.id
  port             = 8080
}
resource "aws_lb_listener" "proxy" {
  load_balancer_arn = aws_lb.proxy.arn
  port              = 443
  protocol          = "TLS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.proxy.arn
  }
}
