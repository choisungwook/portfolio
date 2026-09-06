output "lab" {
  value = {
    region           = "ap-northeast-2"
    project_name     = var.project_name
    role_arn         = aws_iam_role.client.arn
    trust_anchor_arn = aws_rolesanywhere_trust_anchor.lab.arn
    profile_arn      = aws_rolesanywhere_profile.lab.arn
    memory_id        = aws_bedrockagentcore_memory.lab.id
    crl_name         = "${var.project_name}-crl"
  }
}
