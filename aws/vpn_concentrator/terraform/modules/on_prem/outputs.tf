output "vpn_appliance_public_ip" {
  description = "Public IP of the on-prem VPN appliance instance"
  value       = aws_instance.vpn_appliance.public_ip
}

output "vpc_id" {
  description = "VPC ID of the on-prem network"
  value       = module.vpc.vpc_id
}

output "vpn_appliance_id" {
  description = "Instance ID of the on-prem VPN appliance"
  value       = aws_instance.vpn_appliance.id
}

output "internal_server_id" {
  description = "Instance ID of the on-prem internal server"
  value       = aws_instance.internal_server.id
}
