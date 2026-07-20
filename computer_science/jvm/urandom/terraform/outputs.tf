output "legacy_instance_id" {
  description = "재현용(kernel 4.14) 인스턴스 ID"
  value       = aws_instance.legacy.id
}

output "modern_instance_id" {
  description = "대조용(kernel 6.1) 인스턴스 ID"
  value       = aws_instance.modern.id
}

output "ssm_connect_legacy" {
  description = "재현용 인스턴스 SSM 접속 명령"
  value       = "aws ssm start-session --target ${aws_instance.legacy.id} --region ${var.aws_region}"
}

output "ssm_connect_modern" {
  description = "대조용 인스턴스 SSM 접속 명령"
  value       = "aws ssm start-session --target ${aws_instance.modern.id} --region ${var.aws_region}"
}
