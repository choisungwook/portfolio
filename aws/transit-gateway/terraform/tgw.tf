# -----------------------------------------------------------------------------
# Transit Gateway
# -----------------------------------------------------------------------------
resource "aws_ec2_transit_gateway" "main" {
  description                     = "${var.project_name} Transit Gateway"
  default_route_table_association = "enable"
  default_route_table_propagation = "enable"
  dns_support                     = "enable"

  tags = {
    Name = "${var.project_name}-tgw"
  }
}

# -----------------------------------------------------------------------------
# TGW VPC Attachments
# -----------------------------------------------------------------------------
resource "aws_ec2_transit_gateway_vpc_attachment" "this" {
  for_each = var.vpc_configs

  transit_gateway_id = aws_ec2_transit_gateway.main.id
  vpc_id             = module.vpc[each.key].vpc_id
  subnet_ids         = module.vpc[each.key].private_subnets

  tags = {
    Name = "${var.project_name}-tgw-attach-${each.key}"
  }
}

# -----------------------------------------------------------------------------
# VPC Route Tables → TGW routes
# 각 VPC의 private/public route table에 다른 VPC CIDR → TGW 경로 추가
# -----------------------------------------------------------------------------
locals {
  # 각 VPC에서 다른 VPC로의 라우팅 조합 생성
  vpc_routes = flatten([
    for src_key, src_config in var.vpc_configs : [
      for dst_key, dst_config in var.vpc_configs : {
        src_key  = src_key
        dst_key  = dst_key
        dst_cidr = dst_config.cidr
      } if src_key != dst_key
    ]
  ])

  # private route table routes
  private_routes = {
    for route in local.vpc_routes :
    "${route.src_key}-to-${route.dst_key}-private" => route
  }

  # public route table routes
  public_routes = {
    for route in local.vpc_routes :
    "${route.src_key}-to-${route.dst_key}-public" => route
  }
}

resource "aws_route" "private_to_tgw" {
  for_each = local.private_routes

  route_table_id         = module.vpc[each.value.src_key].private_route_table_ids[0]
  destination_cidr_block = each.value.dst_cidr
  transit_gateway_id     = aws_ec2_transit_gateway.main.id

  depends_on = [aws_ec2_transit_gateway_vpc_attachment.this]
}

resource "aws_route" "public_to_tgw" {
  for_each = local.public_routes

  route_table_id         = module.vpc[each.value.src_key].public_route_table_ids[0]
  destination_cidr_block = each.value.dst_cidr
  transit_gateway_id     = aws_ec2_transit_gateway.main.id

  depends_on = [aws_ec2_transit_gateway_vpc_attachment.this]
}
