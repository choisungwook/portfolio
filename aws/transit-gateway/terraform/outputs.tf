output "transit_gateway_id" {
  description = "Transit Gateway ID"
  value       = aws_ec2_transit_gateway.main.id
}

output "vpc_ids" {
  description = "VPC IDs"
  value = {
    for k, v in module.vpc : k => v.vpc_id
  }
}

output "ec2_instance_ids" {
  description = "EC2 instance IDs for SSM session"
  value = {
    for k, v in aws_instance.test : k => v.id
  }
}

output "ec2_private_ips" {
  description = "EC2 private IPs for ping testing"
  value = {
    for k, v in aws_instance.test : k => v.private_ip
  }
}

output "ssm_commands" {
  description = "SSM session commands for each EC2 instance"
  value = {
    for k, v in aws_instance.test :
    k => "aws ssm start-session --target ${v.id}"
  }
}
