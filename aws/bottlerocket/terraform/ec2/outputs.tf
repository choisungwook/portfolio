output "instance_id" {
  description = "Bottlerocket EC2 인스턴스 ID"
  value       = aws_instance.bottlerocket.id
}

output "ami_id" {
  description = "부팅한 Bottlerocket AMI"
  value       = aws_instance.bottlerocket.ami
}

output "ssm_command" {
  description = "control container 접속 명령"
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.bottlerocket.id}"
}
