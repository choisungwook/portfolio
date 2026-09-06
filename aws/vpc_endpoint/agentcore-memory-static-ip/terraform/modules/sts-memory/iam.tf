resource "aws_iam_role" "client" {
  name = "${var.project_name}-client"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Principal = { AWS = var.trusted_principal_arn }, Action = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy" "memory" {
  role = aws_iam_role.client.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow", Action = local.actions, Resource = aws_bedrockagentcore_memory.lab.arn
      Condition = { StringEquals = { "aws:SourceVpce" = module.endpoints.services["memory"].endpoint_id } }
    }]
  })
}
