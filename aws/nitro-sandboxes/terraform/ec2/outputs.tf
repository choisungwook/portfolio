output "instance_id" {
  value = aws_instance.parent.id
}

output "ssh_command" {
  description = "부모 인스턴스 SSH 접속 명령"
  value       = "ssh ec2-user@${aws_instance.parent.public_ip}"
}
