# LiteLLM stdout(JSON 로그). 모든 방안이 이 로그 그룹을 그대로 쓴다.
resource "aws_cloudwatch_log_group" "app" {
  name              = local.app_log_group
  retention_in_days = var.log_retention_days
}

# 수집기가 EMF로 쓰는 로그 그룹. CloudWatch가 이 로그에서 LiteLLM namespace metric을 뽑는다.
resource "aws_cloudwatch_log_group" "emf" {
  name              = local.emf_log_group
  retention_in_days = 1
}

resource "aws_cloudwatch_log_group" "support" {
  name              = "/litellm/${var.env}/support"
  retention_in_days = 3
}
