data "aws_caller_identity" "current" {}

resource "aws_iam_role" "client" {
  name                 = "${var.project_name}-client"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rolesanywhere.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession", "sts:SetSourceIdentity"]
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_rolesanywhere_trust_anchor.lab.arn }
        StringEquals = {
          "aws:SourceAccount"               = data.aws_caller_identity.current.account_id
          "aws:PrincipalTag/x509Subject/CN" = var.certificate_common_name
        }
      }
    }]
  })
}
resource "aws_iam_role_policy" "memory" {
  role = aws_iam_role.client.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock-agentcore:CreateEvent", "bedrock-agentcore:GetEvent", "bedrock-agentcore:DeleteEvent"]
      Resource = aws_bedrockagentcore_memory.lab.arn
    }]
  })
}
