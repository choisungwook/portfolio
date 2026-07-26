output "instance_id" {
  description = "SSM Session Manager로 접속할 인스턴스 ID"
  value       = aws_instance.lab.id
}

output "token_parameter_name" {
  description = "실습 전에 값을 직접 넣어야 하는 SSM Parameter 이름"
  value       = var.token_parameter_name
}

output "session_command" {
  description = "접속 명령"
  value       = "aws ssm start-session --target ${aws_instance.lab.id} --region ${var.aws_region}"
}
