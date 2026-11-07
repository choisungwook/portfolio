# password 방식 DB 사용자의 비밀번호. ephemeral + value_wo라서 state에 남지 않는다.
ephemeral "random_password" "app" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "app_password" {
  name             = "${local.ssm_prefix}/app-password"
  type             = "SecureString" # 기본 키 alias/aws/ssm (AWS 관리형)
  value_wo         = ephemeral.random_password.app.result
  value_wo_version = 1
}

# 앱이 5초마다 읽는 인증 방식 스위치. 마이그레이션 중 CLI로 바꾸므로 Terraform은 값을 추적하지 않는다.
resource "aws_ssm_parameter" "auth_mode" {
  name  = "${local.ssm_prefix}/db-auth-mode"
  type  = "String"
  value = "password"

  lifecycle {
    ignore_changes = [value]
  }
}
