# S06: own-domain TLS NLBs, one per service, opt-in through acm_certificate_arn.
# The listener terminates TLS with our ACM certificate and opens a new TLS connection to
# the same endpoint ENIs that the S01 TCP NLBs use. The client therefore validates our
# name, while AWS receives a ClientHello without SNI and an HTTP Host of our domain.
resource "aws_eip" "tls" {
  for_each = local.tls_service_zones
  domain   = "vpc"
  tags     = { Name = "${var.project_name}-tls-${each.key}" }
}

resource "aws_lb" "tls" {
  for_each                         = local.tls_services
  name                             = "${var.project_name}-tls-${each.key}"
  internal                         = false
  load_balancer_type               = "network"
  ip_address_type                  = "ipv4"
  security_groups                  = [aws_security_group.nlb.id]
  enable_cross_zone_load_balancing = true

  dynamic "subnet_mapping" {
    for_each = var.availability_zones
    content {
      subnet_id     = data.aws_subnet.default[subnet_mapping.value].id
      allocation_id = aws_eip.tls["${each.key}-${subnet_mapping.value}"].id
    }
  }
}

resource "aws_lb_target_group" "tls" {
  for_each             = local.tls_services
  name                 = "${var.project_name}-tls-${each.key}"
  port                 = 443
  protocol             = "TLS"
  target_type          = "ip"
  vpc_id               = data.aws_vpc.default.id
  preserve_client_ip   = false
  proxy_protocol_v2    = false
  deregistration_delay = 10
  health_check {
    protocol = "TCP"
    port     = "traffic-port"
  }
}

resource "aws_lb_target_group_attachment" "tls" {
  for_each         = local.tls_service_zones
  target_group_arn = aws_lb_target_group.tls[each.value.service].arn
  target_id        = data.aws_network_interface.endpoint[each.key].private_ip
  port             = 443
}

resource "aws_lb_listener" "tls" {
  for_each          = local.tls_services
  load_balancer_arn = aws_lb.tls[each.key].arn
  port              = 443
  protocol          = "TLS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tls[each.key].arn
  }
}
