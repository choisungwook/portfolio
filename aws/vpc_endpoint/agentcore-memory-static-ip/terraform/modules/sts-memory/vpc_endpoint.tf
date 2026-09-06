module "endpoints" {
  source       = "../endpoints"
  project_name = var.project_name
  vpc_id       = var.vpc_id
  subnets      = var.subnets
  client_cidrs = var.client_cidrs
  policies = {
    sts = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect = "Allow", Principal = { AWS = var.trusted_principal_arn }
        Action = "sts:AssumeRole", Resource = aws_iam_role.client.arn
      }]
    })
    memory = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect = "Allow", Principal = { AWS = aws_iam_role.client.arn }
        Action = local.actions, Resource = aws_bedrockagentcore_memory.lab.arn
      }]
    })
  }
}
