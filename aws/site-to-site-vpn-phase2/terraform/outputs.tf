output "cloud_nginx_ssm_command" {
  description = "Command to start an SSM session with the cloud nginx instance."
  value       = "aws ssm start-session --target ${module.aws_cloud.test_vm_id}"
}

output "onprem_vpn_appliance_ssm_command" {
  description = "Command to start an SSM session with the onprem VPN appliance instance."
  value       = "aws ssm start-session --target ${module.on_prem.vpn_appliance_id}"
}

output "onprem_nginx_ssm_command" {
  description = "Command to start an SSM session with the onprem nginx instance."
  value       = "aws ssm start-session --target ${module.on_prem.nginx_id}"
}

output "onprem_vpn_appliance_public_ip" {
  description = "The public IP address of the onprem VPN appliance EC2 instance. Use this as the Customer Gateway IP in the AWS console."
  value       = module.on_prem.vpn_appliance_public_ip
}
