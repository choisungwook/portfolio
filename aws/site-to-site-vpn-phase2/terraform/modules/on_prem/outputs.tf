output "vpn_appliance_public_ip" {
  description = "Public IP of the onprem VPN appliance instance"
  value       = aws_instance.vpn_appliance.public_ip
}

output "vpc_id" {
  description = "VPC ID of the onprem network"
  value       = module.vpc.vpc_id
}

output "vpn_appliance_id" {
  description = "Instance ID of the onprem VPN appliance"
  value       = aws_instance.vpn_appliance.id
}

output "nginx_id" {
  description = "Instance ID of the onprem nginx server"
  value       = aws_instance.nginx.id
}
