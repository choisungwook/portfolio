output "instance_id" {
  description = "실습 EC2 인스턴스 ID"
  value       = aws_instance.selinux_lab.id
}

output "ssm_command" {
  description = "SSM 접속 명령"
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.selinux_lab.id}"
}
