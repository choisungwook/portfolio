# public: NAT gateway, firewall: Network Firewall endpoints (intra subnets of the module).
# The module makes only one private route table when single_nat_gateway = true,
# so the app subnets that need a route table per AZ are created in app_subnet.tf.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = var.project_name
  cidr = local.vpc_cidr
  azs  = local.azs

  public_subnets = ["10.0.0.0/24", "10.0.1.0/24"]

  intra_subnets       = ["10.0.10.0/28", "10.0.10.16/28"]
  intra_subnet_suffix = "firewall"

  enable_nat_gateway = true
  single_nat_gateway = true
  # No private subnets in the module, so skip its private NAT route.
  create_private_nat_gateway_route = false

  enable_dns_hostnames = true
  enable_dns_support   = true
}

# Firewall subnets send inspected traffic to the NAT gateway.
resource "aws_route" "firewall_to_nat" {
  route_table_id         = module.vpc.intra_route_table_ids[0]
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = module.vpc.natgw_ids[0]
}
