resource "aws_subnet" "app" {
  for_each = local.app_subnets

  vpc_id            = module.vpc.vpc_id
  availability_zone = each.key
  cidr_block        = each.value

  tags = {
    Name = "${var.project_name}-app-${each.key}"
  }
}

resource "aws_route_table" "app" {
  for_each = local.app_subnets

  vpc_id = module.vpc.vpc_id

  tags = {
    Name = "${var.project_name}-app-${each.key}"
  }
}

# Before the firewall: app -> NAT. The hands-on changes this target to the
# firewall endpoint in the console. Running terraform apply again reverts it.
resource "aws_route" "app_default" {
  for_each = local.app_subnets

  route_table_id         = aws_route_table.app[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = module.vpc.natgw_ids[0]
}

resource "aws_route_table_association" "app" {
  for_each = local.app_subnets

  subnet_id      = aws_subnet.app[each.key].id
  route_table_id = aws_route_table.app[each.key].id
}
