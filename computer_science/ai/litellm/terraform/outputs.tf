output "instance_id" {
  description = "SSM으로 접속할 EC2 인스턴스 ID"
  value       = aws_instance.litellm.id
}

output "ssm_start_session" {
  description = "EC2에 접속하는 SSM 명령"
  value       = "aws ssm start-session --target ${aws_instance.litellm.id} --region ${var.aws_region}"
}

output "ecr_repository_url" {
  description = "LiteLLM 이미지를 push할 ECR repository URL"
  value       = aws_ecr_repository.litellm.repository_url
}

output "vpc_id" {
  description = "폐쇄망 VPC ID"
  value       = module.vpc.vpc_id
}
