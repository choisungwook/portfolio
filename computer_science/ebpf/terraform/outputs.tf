output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.ebpf_lab.id
}

output "instance_public_ip" {
  description = "EC2 instance public IP address"
  value       = aws_instance.ebpf_lab.public_ip
}

output "ssm_connect_command" {
  description = "Command to connect to EC2 instance via SSM"
  value       = "aws ssm start-session --target '${aws_instance.ebpf_lab.id}'"
}
