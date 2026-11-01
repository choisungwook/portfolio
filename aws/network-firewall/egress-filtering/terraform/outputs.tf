output "vpc_id" {
  value = module.vpc.vpc_id
}

output "firewall_subnet_ids" {
  value = zipmap(local.azs, module.vpc.intra_subnets)
}

output "app_route_table_ids" {
  value = { for az, rt in aws_route_table.app : az => rt.id }
}

output "public_route_table_id" {
  value = module.vpc.public_route_table_ids[0]
}

output "nat_gateway_id" {
  value = module.vpc.natgw_ids[0]
}

output "nat_public_ip" {
  value = module.vpc.nat_public_ips[0]
}

output "instance_ids" {
  value = { for az, i in aws_instance.app : az => i.id }
}
