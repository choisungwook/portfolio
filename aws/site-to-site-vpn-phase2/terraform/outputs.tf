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

output "tgw_id" {
  description = "The ID of the Transit Gateway"
  value       = module.aws_cloud.tgw_id
}

output "tgw_flow_log_group_name" {
  description = "CloudWatch Log Group name for TGW flow logs. Use this to query flow logs in CloudWatch Logs Insights."
  value       = module.aws_cloud.tgw_flow_log_group_name
}
