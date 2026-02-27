output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnets" {
  value = module.vpc.private_subnets
}

output "public_subnets" {
  value = module.vpc.public_subnets
}

output "test_vm_id" {
  value = aws_instance.test_vm.id
}

output "private_route_table_ids" {
  description = "The IDs of the private route tables"
  value       = module.vpc.private_route_table_ids
}

output "tgw_id" {
  description = "The ID of the Transit Gateway"
  value       = aws_ec2_transit_gateway.this.id
}

output "tgw_flow_log_group_name" {
  description = "CloudWatch Log Group name for TGW flow logs"
  value       = aws_cloudwatch_log_group.tgw_flow_logs.name
}
