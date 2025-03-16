output "vpc_id" {
  description = "vpc_id"
  value       = aws_vpc.main.id
}

output "private_subnets_ids" {
  description = "private subnets"
  value       = [for private_subnet in aws_subnet.private : private_subnet.id]
}

output "public_subnets_ids" {
  description = "private subnets"
  value       = [for public_subnets in aws_subnet.public : public_subnets.id]
}

output "private_route_table_ids" {
  description = "private route table id"
  value       = [for private_route_table in aws_route_table.private : private_route_table.id]
}
