output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.test.id
}

output "ssm_command" {
  description = "SSM Session Manager command to connect"
  value       = "aws ssm start-session --target ${aws_instance.test.id} --region ${var.aws_region}"
}
