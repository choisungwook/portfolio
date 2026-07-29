# 자격증명은 코드와 user_data에 남기지 않고 SSM SecureString으로만 전달한다.
# systemd 유닛이 기동 시 이 파라미터를 읽어 환경변수로 주입한다.

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
