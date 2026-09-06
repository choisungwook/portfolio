resource "aws_vpc_endpoint" "api" {
  for_each            = local.services
  vpc_id              = var.vpc_id
  vpc_endpoint_type   = "Interface"
  service_name        = data.aws_vpc_endpoint_service.api[each.key].service_name
  subnet_ids          = values(var.subnets)
  security_group_ids  = [aws_security_group.endpoint.id]
  private_dns_enabled = false
  ip_address_type     = "ipv4"
  policy              = var.policies[each.key]
  tags                = { Name = "${var.project_name}-${each.key}" }
  lifecycle {
    precondition {
      condition = alltrue([
        for az in keys(var.subnets) : contains(data.aws_vpc_endpoint_service.api[each.key].availability_zones, az)
      ])
      error_message = "One or more selected AZs do not support this endpoint service."
    }
  }
}
