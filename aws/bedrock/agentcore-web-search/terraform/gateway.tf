resource "aws_bedrockagentcore_gateway" "web_search" {
  name        = var.project_name
  description = "MCP gateway for the managed AgentCore Web Search connector"
  role_arn    = aws_iam_role.gateway.arn

  authorizer_type = "AWS_IAM"
  protocol_type   = "MCP"

  protocol_configuration {
    mcp {
      instructions       = "Search the public web and preserve source citations."
      search_type        = "SEMANTIC"
      supported_versions = ["2025-03-26", "2025-06-18"]
    }
  }
}
