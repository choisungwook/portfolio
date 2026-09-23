locals {
  # 계정 하나(방안 1)면 accountId를 빼고, 모니터링 계정(방안 2)이면 metric마다 accountId를 붙인다.
  metric_options = {
    for account in var.accounts : account.name => merge(
      { label = account.name },
      var.cross_account ? { accountId = account.account_id } : {},
    )
  }

  # 모니터링 계정의 Logs Insights는 source 계정 로그 그룹을 ARN으로만 가리킨다.
  log_source = join(" | ", [
    for account in var.accounts : "SOURCE '${var.cross_account ? account.log_group_arn : account.log_group_name}'"
  ])

  # Metrics Insights는 AWS.AccountId로 계정을 가른다. 계정 하나일 때는 필요 없다.
  group_by_account = var.cross_account ? "AWS.AccountId, " : ""

  guide = <<-EOT
    ## LiteLLM 한눈에 보기
    처음 보는 사람은 위 줄부터 본다. **정상 replica 수**가 desired count보다 작거나 **5xx**가 0보다 크면 이상이다.
    비용 숫자는 LiteLLM 가격표로 계산한 추정치다. AWS 청구서와 같지 않다.
  EOT

  widgets = [
    {
      type       = "text"
      x          = 0
      y          = 0
      width      = 24
      height     = 3
      properties = { markdown = local.guide }
    },
    {
      type   = "metric"
      x      = 0
      y      = 3
      width  = 6
      height = 6
      properties = {
        title  = "정상 replica 수"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "Minimum"
        period = 60
        metrics = [for account in var.accounts : [
          "AWS/ApplicationELB", "HealthyHostCount",
          "TargetGroup", account.target_group_arn_suffix,
          "LoadBalancer", account.alb_arn_suffix,
          local.metric_options[account.name],
        ]]
      }
    },
    {
      type   = "metric"
      x      = 6
      y      = 3
      width  = 6
      height = 6
      properties = {
        title  = "요청 수 (1분)"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "Sum"
        period = 60
        metrics = [for account in var.accounts : [
          "AWS/ApplicationELB", "RequestCount", "LoadBalancer", account.alb_arn_suffix,
          local.metric_options[account.name],
        ]]
      }
    },
    {
      type   = "metric"
      x      = 12
      y      = 3
      width  = 6
      height = 6
      properties = {
        title  = "5xx 응답 수 (1분)"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "Sum"
        period = 60
        metrics = [for account in var.accounts : [
          "AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", account.alb_arn_suffix,
          local.metric_options[account.name],
        ]]
      }
    },
    {
      type   = "metric"
      x      = 18
      y      = 3
      width  = 6
      height = 6
      properties = {
        title  = "p95 응답 시간 (초)"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "p95"
        period = 60
        metrics = [for account in var.accounts : [
          "AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", account.alb_arn_suffix,
          local.metric_options[account.name],
        ]]
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 9
      width  = 12
      height = 6
      properties = {
        title  = "ECS CPU 사용률 (%)"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "Average"
        period = 60
        metrics = [for account in var.accounts : [
          "AWS/ECS", "CPUUtilization", "ClusterName", account.cluster_name, "ServiceName", account.service_name,
          local.metric_options[account.name],
        ]]
      }
    },
    {
      type   = "metric"
      x      = 12
      y      = 9
      width  = 12
      height = 6
      properties = {
        title  = "ECS 메모리 사용률 (%)"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "Average"
        period = 60
        metrics = [for account in var.accounts : [
          "AWS/ECS", "MemoryUtilization", "ClusterName", account.cluster_name, "ServiceName", account.service_name,
          local.metric_options[account.name],
        ]]
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 15
      width  = 8
      height = 6
      properties = {
        title  = "team별 spend (USD, 1시간)"
        region = var.aws_region
        view   = "timeSeries"
        period = 3600
        metrics = [[{
          id         = "spend"
          expression = "SELECT SUM(litellm_spend_metric_total) FROM SCHEMA(LiteLLM, team_alias) GROUP BY ${local.group_by_account}team_alias"
          period     = 3600
        }]]
      }
    },
    {
      type   = "metric"
      x      = 8
      y      = 15
      width  = 8
      height = 6
      properties = {
        title  = "model별 요청 수 (5분)"
        region = var.aws_region
        view   = "timeSeries"
        period = 300
        metrics = [[{
          id         = "requests"
          expression = "SELECT SUM(litellm_proxy_total_requests_metric_total) FROM SCHEMA(LiteLLM, requested_model) GROUP BY ${local.group_by_account}requested_model"
          period     = 300
        }]]
      }
    },
    {
      type   = "metric"
      x      = 16
      y      = 15
      width  = 8
      height = 6
      properties = {
        title  = "실패 요청 수 (5분)"
        region = var.aws_region
        view   = "timeSeries"
        period = 300
        metrics = [[{
          id         = "failed"
          expression = var.cross_account ? "SELECT SUM(litellm_proxy_failed_requests_metric_total) FROM SCHEMA(LiteLLM) GROUP BY AWS.AccountId" : "SELECT SUM(litellm_proxy_failed_requests_metric_total) FROM SCHEMA(LiteLLM)"
          period     = 300
        }]]
      }
    },
    {
      type   = "log"
      x      = 0
      y      = 21
      width  = 12
      height = 6
      properties = {
        title  = "에러 로그 수 (5분)"
        region = var.aws_region
        view   = "timeSeries"
        query  = "${local.log_source} | filter level = \"ERROR\" | stats count(*) as errors by bin(5m)"
      }
    },
    {
      type   = "log"
      x      = 12
      y      = 21
      width  = 12
      height = 6
      properties = {
        title  = "HTTP 상태 코드별 요청 수 (5분)"
        region = var.aws_region
        view   = "timeSeries"
        query  = "${local.log_source} | filter component = \"uvicorn.access\" and message not like /liveliness/ | parse message /\" (?<status>\\d{3})$/ | stats count(*) by status, bin(5m)"
      }
    },
    {
      type   = "log"
      x      = 0
      y      = 27
      width  = 24
      height = 8
      properties = {
        title  = "최근 에러 로그"
        region = var.aws_region
        view   = "table"
        query  = "${local.log_source} | fields @timestamp, @log, level, message | filter level = \"ERROR\" | sort @timestamp desc | limit 50"
      }
    },
  ]
}

resource "aws_cloudwatch_dashboard" "litellm" {
  dashboard_name = var.dashboard_name
  dashboard_body = jsonencode({ widgets = local.widgets })
}
