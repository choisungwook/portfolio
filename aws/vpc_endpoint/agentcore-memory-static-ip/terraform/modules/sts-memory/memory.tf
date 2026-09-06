resource "aws_bedrockagentcore_memory" "lab" {
  name                  = replace(var.project_name, "-", "_")
  event_expiry_duration = 7
}
locals {
  actions = ["bedrock-agentcore:CreateEvent", "bedrock-agentcore:GetEvent", "bedrock-agentcore:DeleteEvent"]
}
