output "endpoint_security_group_id" { value = module.endpoints.security_group_id }
output "lab" {
  value = {
    region    = "ap-northeast-2", role_arn = aws_iam_role.client.arn
    memory_id = aws_bedrockagentcore_memory.lab.id, services = module.endpoints.services
  }
}
