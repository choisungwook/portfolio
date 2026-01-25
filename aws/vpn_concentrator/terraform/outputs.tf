output "aws_cloud_test_vm_ssm_command" {
  description = "Command to start an SSM session with the AWS Cloud test instance."
  value       = "aws ssm start-session --target ${module.aws_cloud.test_vm_id}"
}

output "on_prem_vpn_appliance_ssm_command" {
  description = "Command to start an SSM session with the on-prem VPN appliance instance."
  value       = "aws ssm start-session --target ${module.on_prem.vpn_appliance_id}"
}

output "on_prem_internal_server_ssm_command" {
  description = "Command to start an SSM session with the on-prem internal server instance."
  value       = "aws ssm start-session --target ${module.on_prem.internal_server_id}"
}

output "on_prem_vpn_appliance_public_ip" {
  description = "The public IP address of the on-prem VPN appliance EC2 instance. Use this as the Customer Gateway IP in the AWS console."
  value       = module.on_prem.vpn_appliance_public_ip
}
