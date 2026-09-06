locals {
  services = {
    sts = {
      service_name = "com.amazonaws.${var.aws_region}.sts"
      hostname     = "sts.${var.aws_region}.amazonaws.com"
    }
    memory = {
      service_name = "com.amazonaws.${var.aws_region}.bedrock-agentcore"
      hostname     = "bedrock-agentcore.${var.aws_region}.amazonaws.com"
    }
  }
  service_zones = {
    for pair in setproduct(keys(local.services), var.availability_zones) :
    "${pair[0]}-${pair[1]}" => { service = pair[0], az = pair[1] }
  }
  memory_actions = [
    "bedrock-agentcore:CreateEvent",
    "bedrock-agentcore:GetEvent",
    "bedrock-agentcore:DeleteEvent",
  ]
}
