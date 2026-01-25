# resource "aws_customer_gateway" "on_prem_cgw" {
#   bgp_asn    = 65000
#   ip_address = module.on_prem.vpn_appliance_public_ip
#   type       = "ipsec.1"

#   tags = {
#     Name    = "${var.project_name}-on-prem-cgw"
#     Project = var.project_name
#   }
# }

# resource "aws_ec2_transit_gateway" "vpn_concentrator_tgw" {
#   description = "TGW for VPN Concentrator"

#   tags = {
#     Name    = "${var.project_name}-vpn-concentrator-tgw"
#     Project = var.project_name
#   }
# }

# resource "aws_ec2_transit_gateway_vpc_attachment" "aws_cloud_vpc_attachment" {
#   subnet_ids         = module.aws_cloud.private_subnets
#   transit_gateway_id = aws_ec2_transit_gateway.vpn_concentrator_tgw.id
#   vpc_id             = module.aws_cloud.vpc_id

#   tags = {
#     Name    = "${var.project_name}-aws-cloud-vpc-attachment"
#     Project = var.project_name
#   }
# }

# resource "aws_vpn_connection" "to_on_prem" {
#   customer_gateway_id = aws_customer_gateway.on_prem_cgw.id
#   transit_gateway_id  = aws_ec2_transit_gateway.vpn_concentrator_tgw.id
#   type                = "ipsec.1"
#   static_routes_only  = false # Using BGP

#   tags = {
#     Name    = "${var.project_name}-vpn-to-on-prem"
#     Project = var.project_name
#   }
# }
