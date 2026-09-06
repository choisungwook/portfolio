resource "aws_vpc_endpoint" "api" {
  for_each            = local.services
  vpc_id              = data.aws_vpc.default.id
  vpc_endpoint_type   = "Interface"
  service_name        = data.aws_vpc_endpoint_service.api[each.key].service_name
  subnet_ids          = [for subnet in data.aws_subnet.default : subnet.id]
  security_group_ids  = [aws_security_group.endpoint.id]
  private_dns_enabled = false
  ip_address_type     = "ipv4"
  policy              = local.endpoint_policies[each.key]
  tags                = { Name = "${var.project_name}-${each.key}" }

  lifecycle {
    precondition {
      condition = alltrue([
        for az in var.availability_zones :
        contains(data.aws_vpc_endpoint_service.api[each.key].availability_zones, az)
      ])
      error_message = "One or more selected AZs do not support this endpoint service."
    }
  }
}

locals {
  endpoint_policies = {
    # PoC: the STS endpoint accepts every principal. With /etc/hosts pointing at the NLB,
    # every STS call from this machine (Terraform, the admin profile's own AssumeRole,
    # the lab AssumeRole) passes through this endpoint, so a narrow policy blocks the
    # management path as well. In production, restrict it to the client principal:
    #
    # sts = jsonencode({
    #   Version = "2012-10-17"
    #   Statement = [
    #     {
    #       Effect    = "Allow"
    #       Principal = { AWS = "arn:aws:iam::123456789012:user/app-client" }
    #       Action    = "sts:AssumeRole"
    #       Resource  = "arn:aws:iam::123456789012:role/memory-static-ip-client"
    #     },
    #     {
    #       Effect    = "Allow"
    #       Principal = { AWS = "arn:aws:iam::123456789012:role/memory-static-ip-client" }
    #       Action    = "sts:GetCallerIdentity"
    #       Resource  = "*"
    #     }
    #   ]
    # })
    sts = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect    = "Allow"
        Principal = "*"
        Action    = "*"
        Resource  = "*"
      }]
    })
    memory = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.client.arn }
        Action    = local.memory_actions
        Resource  = aws_bedrockagentcore_memory.lab.arn
      }]
    })
  }
}
