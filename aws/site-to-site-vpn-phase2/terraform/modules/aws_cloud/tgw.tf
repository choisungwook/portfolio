resource "aws_ec2_transit_gateway" "this" {
  description                    = "Transit Gateway for Site-to-Site VPN"
  amazon_side_asn                = 64512
  default_route_table_association = "enable"
  default_route_table_propagation = "enable"

  tags = {
    Name    = "${var.project_name}-tgw"
    Project = var.project_name
  }
}

resource "aws_ec2_transit_gateway_vpc_attachment" "cloud_vpc" {
  transit_gateway_id = aws_ec2_transit_gateway.this.id
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets

  tags = {
    Name    = "${var.project_name}-cloud-vpc-attachment"
    Project = var.project_name
  }
}

resource "aws_route" "to_onprem_via_tgw" {
  count                  = length(module.vpc.private_route_table_ids)
  route_table_id         = module.vpc.private_route_table_ids[count.index]
  destination_cidr_block = var.onprem_vpc_cidr
  transit_gateway_id     = aws_ec2_transit_gateway.this.id
}
