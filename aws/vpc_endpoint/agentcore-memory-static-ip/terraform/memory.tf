resource "aws_bedrockagentcore_memory" "lab" {
  name                  = replace(var.project_name, "-", "_")
  description           = "Short-term event round trip through static-IP NLBs."
  event_expiry_duration = 7
}
