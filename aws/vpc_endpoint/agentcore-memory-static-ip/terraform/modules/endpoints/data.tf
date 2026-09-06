locals {
  catalog = {
    sts    = { service_name = "com.amazonaws.ap-northeast-2.sts", hostname = "sts.ap-northeast-2.amazonaws.com" }
    memory = { service_name = "com.amazonaws.ap-northeast-2.bedrock-agentcore", hostname = "bedrock-agentcore.ap-northeast-2.amazonaws.com" }
  }
  services = { for key in keys(var.policies) : key => local.catalog[key] }
  service_zones = {
    for pair in setproduct(keys(local.services), keys(var.subnets)) :
    "${pair[0]}-${pair[1]}" => { service = pair[0], az = pair[1] }
  }
}
data "aws_subnet" "selected" {
  for_each = var.subnets
  id       = each.value
  lifecycle {
    postcondition {
      condition     = self.vpc_id == var.vpc_id && self.availability_zone == each.key
      error_message = "Each subnet must belong to vpc_id and to the AZ used as its map key."
    }
  }
}
data "aws_vpc_endpoint_service" "api" {
  for_each     = local.services
  service_name = each.value.service_name
}
data "aws_network_interface" "endpoint" {
  for_each = local.service_zones
  filter {
    name   = "network-interface-id"
    values = tolist(aws_vpc_endpoint.api[each.value.service].network_interface_ids)
  }
  filter {
    name   = "subnet-id"
    values = [var.subnets[each.value.az]]
  }
}
