##########################
## Customer Gateway
##########################

resource "aws_customer_gateway" "main" {
  bgp_asn    = 65000
  ip_address = module.onprem_libreswan.public_ip
  type       = "ipsec.1"

  tags = {
    Name = "to-onprem"
  }
}

##########################
## Private gateway
##########################

# # Virtual Private Gateway for the cloud VPC
# resource "aws_vpn_gateway" "main" {
#   vpc_id = module.vpc_cloud.vpc_id

#   tags = {
#     Name = "from-cloud"
#   }
# }

# # VPN Connection between the Customer Gateway and Virtual Private Gateway
# resource "aws_vpn_connection" "main" {
#   customer_gateway_id = aws_customer_gateway.main.id
#   vpn_gateway_id      = aws_vpn_gateway.main.id
#   type                = "ipsec.1"
#   static_routes_only  = true

#   tags = {
#     Name = "onprem-to-cloud-vpn"
#   }
# }

# # Static route for the VPN connection to route traffic to on-premises network
# resource "aws_vpn_connection_route" "to_onprem" {
#   destination_cidr_block = var.vpc_onprem_cidr
#   vpn_connection_id      = aws_vpn_connection.main.id
# }

# # VPN Gateway route propagation for cloud private subnets
# resource "aws_vpn_gateway_route_propagation" "private" {
#   count = length(module.vpc_cloud.private_route_table_ids)

#   vpn_gateway_id = aws_vpn_gateway.main.id
#   route_table_id = module.vpc_cloud.private_route_table_ids[count.index]
# }
