output "repository_url" {
  description = "agent 이미지를 push할 ECR 저장소"
  value       = aws_ecr_repository.agent.repository_url
}

output "runtime_arns" {
  description = "runtime 이름별 ARN"
  value       = { for key, runtime in aws_bedrockagentcore_agent_runtime.agent : key => runtime.agent_runtime_arn }
}

output "runtime_env" {
  description = "scripts가 읽는 환경 변수 파일 내용"
  value = join("\n", concat(
    ["AWS_REGION=${var.aws_region}", "USAGE_LOG_GROUP=${aws_cloudwatch_log_group.usage.name}"],
    [for key, runtime in aws_bedrockagentcore_agent_runtime.agent : "RUNTIME_${upper(key)}_ARN=${runtime.agent_runtime_arn}"],
  ))
}

output "usage_log_group" {
  description = "USAGE_LOGS가 쌓이는 log group"
  value       = aws_cloudwatch_log_group.usage.name
}
