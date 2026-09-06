data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default" {
  for_each          = var.availability_zones
  vpc_id            = data.aws_vpc.default.id
  availability_zone = each.key
  default_for_az    = true
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
    values = [data.aws_subnet.default[each.value.az].id]
  }
}
