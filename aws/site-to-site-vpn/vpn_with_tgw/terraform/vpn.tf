##########################
## Customer Gateway
##########################

# onpremise VPC에 있는 onprem_strongswan EC2 인스턴스의 public IP를 사용
resource "aws_customer_gateway" "main" {
  bgp_asn    = 65000
  ip_address = module.onprem_strongswan.public_ip
  type       = "ipsec.1"

  tags = {
    Name = "to-onprem"
  }
}

##########################
## VPN connection
##########################

resource "aws_vpn_connection" "main" {
  transit_gateway_id  = aws_ec2_transit_gateway.main.id
  customer_gateway_id = aws_customer_gateway.main.id
  type                = aws_customer_gateway.main.type

  static_routes_only = false # use BGP for dynamic routing, not static routes

  tags = {
    Name = "tgw-vpn"
  }
}
