##########################
## Transit Gateway
##########################

resource "aws_ec2_transit_gateway" "main" {
  description = "Transit Gateway for VPN connection"

  # disable the default route table association and propagation
  default_route_table_association = "disable"
  default_route_table_propagation = "disable"

  tags = {
    Name        = "vpn"
    environment = "test"
  }
}

##########################
## Transit Gateway VPC Attachments
##########################

# AWS Site to Site VPN connection을 생성하면, 자동으로 tgw attachment가 생성됩니다.
# 그러므로 data 리소스로 attachment를 import합니다.
data "aws_ec2_transit_gateway_vpn_attachment" "main" {
  filter {
    name   = "resource-type"
    values = ["vpn"]
  }

  filter {
    name   = "transit-gateway-id"
    values = [aws_ec2_transit_gateway.main.id]
  }

  filter {
    name   = "resource-id"
    values = [aws_vpn_connection.main.id]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

##########################
## Transit Gateway Route
##########################

resource "aws_ec2_transit_gateway_route_table" "to-vpc" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id

  tags = {
    Name        = "to-vpc"
    environment = "test"
  }
}

resource "aws_ec2_transit_gateway_route_table" "to-vpn" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id

  tags = {
    Name        = "vpn"
    environment = "test"
  }
}

##########################
## Transit Gateway Route Table
##########################

# resource "aws_ec2_transit_gateway_route" "vpn" {
#   transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.to-vpn.id
#   destination_cidr_block         = "192.168.0.0/16"
#   transit_gateway_attachment_id  = data.aws_ec2_transit_gateway_vpn_attachment.vpn-attachement.id
# }


# resource "aws_ec2_transit_gateway_route" "vpc" {
#   transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.route-table-to-vpc.id

#   destination_cidr_block         = "10.226.0.0/16"
#   transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment.testbed-vpc-attach.id
# }
