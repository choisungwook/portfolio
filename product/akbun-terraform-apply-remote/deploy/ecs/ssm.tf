# 자격증명은 SSM SecureString으로만 전달하고 task definition에는
# 파라미터 ARN만 남긴다. 값은 ECS가 컨테이너 기동 시 주입한다.

resource "aws_ssm_parameter" "webhook_secret" {
  name  = "/${var.project_name}/webhook-secret"
  type  = "SecureString"
  value = var.webhook_secret
}

resource "aws_ssm_parameter" "github_token" {
  name  = "/${var.project_name}/github-token"
  type  = "SecureString"
  value = var.github_token
}
