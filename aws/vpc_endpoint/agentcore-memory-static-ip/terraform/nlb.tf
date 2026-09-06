resource "aws_eip" "nlb" {
  for_each = local.service_zones
  domain   = "vpc"
  tags     = { Name = "${var.project_name}-${each.key}" }
}

resource "aws_lb" "api" {
  for_each                         = local.services
  name                             = "${var.project_name}-${each.key}"
  internal                         = false
  load_balancer_type               = "network"
  ip_address_type                  = "ipv4"
  security_groups                  = [aws_security_group.nlb.id]
  enable_cross_zone_load_balancing = true

  dynamic "subnet_mapping" {
    for_each = var.availability_zones
    content {
      subnet_id     = data.aws_subnet.default[subnet_mapping.value].id
      allocation_id = aws_eip.nlb["${each.key}-${subnet_mapping.value}"].id
    }
  }
}

resource "aws_lb_target_group" "api" {
  for_each             = local.services
  name                 = "${var.project_name}-${each.key}"
  port                 = 443
  protocol             = "TCP"
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

resource "aws_lb_target_group_attachment" "endpoint" {
  for_each         = local.service_zones
  target_group_arn = aws_lb_target_group.api[each.value.service].arn
  target_id        = data.aws_network_interface.endpoint[each.key].private_ip
  port             = 443
}

resource "aws_lb_listener" "api" {
  for_each          = local.services
  load_balancer_arn = aws_lb.api[each.key].arn
  port              = 443
  protocol          = "TCP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[each.key].arn
  }
}
