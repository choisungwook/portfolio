# 방안 3·4의 Grafana가 쓰는 대시보드.
# metric 대시보드 2개는 로컬 lab과 같은 파일이다. 로그 대시보드는 계정마다 로그 그룹 ARN이 달라 terraform에서 만든다.
locals {
  source_log_groups = {
    dev  = { account_id = local.account_ids.dev, arn = module.litellm_dev.app_log_group_arn, name = module.litellm_dev.app_log_group_name }
    prod = { account_id = local.account_ids.prod, arn = module.litellm_prod.app_log_group_arn, name = module.litellm_prod.app_log_group_name }
  }

  # 헬스 체크 로그는 요청 수를 부풀리므로 뺀다.
  logs_queries = {
    errors = "fields @timestamp | filter level = \"ERROR\" | stats count(*) as errors by bin(5m)"
    status = "filter component = \"uvicorn.access\" and message not like /liveliness/ | parse message /\" (?<status>\\d{3})$/ | stats count(*) by status, bin(5m)"
    recent = "fields @timestamp, level, message | filter level = \"ERROR\" | sort @timestamp desc | limit 50"
  }

  # datasource를 변수로 둔다. AMG처럼 uid를 정할 수 없는 Grafana에 가져와도 드롭다운에서 고르면 된다.
  cloudwatch_datasource = { type = "cloudwatch", uid = "$${cloudwatch}" }

  logs_targets = {
    for query_name, expression in local.logs_queries : query_name => [
      for env, log_group in local.source_log_groups : {
        refId      = upper(env)
        datasource = local.cloudwatch_datasource
        queryMode  = "Logs"
        region     = "default"
        id         = ""
        expression = expression
        logGroups  = [{ arn = log_group.arn, name = log_group.name, accountId = log_group.account_id }]
      }
    ]
  }

  logs_dashboard = jsonencode({
    uid           = "litellm-logs"
    title         = "LiteLLM 로그"
    description   = "CloudWatch Logs Insights로 dev·prod 계정의 LiteLLM 로그를 함께 본다"
    tags          = ["litellm"]
    schemaVersion = 41
    time          = { from = "now-3h", to = "now" }
    templating = {
      list = [{ name = "cloudwatch", label = "CloudWatch", type = "datasource", query = "cloudwatch", current = {}, hide = 0 }]
    }
    panels = [
      {
        id      = 1
        type    = "text"
        title   = ""
        gridPos = { x = 0, y = 0, w = 24, h = 3 }
        options = { mode = "markdown", content = "**처음 보는 사람용 안내** · 로그는 각 계정 CloudWatch Logs에 그대로 있고, 이 화면은 OAM으로 모니터링 계정에서 읽는다. 조회할 때마다 스캔한 GB만큼 Logs Insights 요금이 붙으니 시간 범위를 필요한 만큼만 연다." }
      },
      {
        id          = 2
        type        = "timeseries"
        title       = "계정별 에러 로그 수"
        description = "level이 ERROR인 로그를 5분마다 센다."
        gridPos     = { x = 0, y = 3, w = 12, h = 8 }
        datasource  = local.cloudwatch_datasource
        targets     = local.logs_targets.errors
      },
      {
        id          = 3
        type        = "timeseries"
        title       = "HTTP 상태 코드별 요청 수"
        description = "uvicorn access log에서 상태 코드를 뽑는다. 헬스 체크는 뺀다."
        gridPos     = { x = 12, y = 3, w = 12, h = 8 }
        datasource  = local.cloudwatch_datasource
        targets     = local.logs_targets.status
      },
      {
        id          = 4
        type        = "table"
        title       = "최근 에러 로그"
        description = "계정마다 최근 ERROR 로그 50줄."
        gridPos     = { x = 0, y = 11, w = 24, h = 12 }
        datasource  = local.cloudwatch_datasource
        targets     = local.logs_targets.recent
      },
    ]
  })

  grafana_dashboards = {
    "litellm-overview" = jsonencode(jsondecode(file("${path.module}/../local/grafana/dashboards/litellm-overview.json")))
    "litellm-cost"     = jsonencode(jsondecode(file("${path.module}/../local/grafana/dashboards/litellm-cost.json")))
    "litellm-logs"     = local.logs_dashboard
  }
}
