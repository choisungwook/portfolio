output "gateway_id" {
  description = "AgentCore Gateway ID"
  value       = aws_bedrockagentcore_gateway.web_search.gateway_id
}

output "gateway_url" {
  description = "SigV4로 호출할 AgentCore MCP URL"
  value       = aws_bedrockagentcore_gateway.web_search.gateway_url
}

output "aws_region" {
  description = "Gateway와 Web Search connector가 배포된 AWS 리전"
  value       = var.aws_region
}

output "gateway_arn" {
  description = "운영 IAM 정책 범위에 사용할 Gateway ARN"
  value       = aws_bedrockagentcore_gateway.web_search.gateway_arn
}

output "caller_policy_json" {
  description = "EC2 instance profile, ECS task role, EKS Pod Identity role에 붙일 최소 권한"
  value       = data.aws_iam_policy_document.caller_permissions.json
}

output "log_group_name" {
  description = "Gateway 요청과 응답을 확인할 CloudWatch Logs 그룹"
  value       = aws_cloudwatch_log_group.gateway.name
}
