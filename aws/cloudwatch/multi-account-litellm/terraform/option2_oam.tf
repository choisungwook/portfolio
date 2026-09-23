# 방안 2. 모니터링 계정에 sink를 만들고 dev·prod가 link를 건다.
# metric과 로그는 복사되지 않는다. 모니터링 계정은 source 계정의 데이터를 조회만 한다.
resource "aws_oam_sink" "monitoring" {
  provider = aws.monitoring
  count    = var.enable_oam ? 1 : 0

  name = var.project_name
}

resource "aws_oam_sink_policy" "monitoring" {
  provider = aws.monitoring
  count    = var.enable_oam ? 1 : 0

  sink_identifier = aws_oam_sink.monitoring[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = ["oam:CreateLink", "oam:UpdateLink"]
      Resource  = "*"
      Principal = { AWS = [local.account_ids.dev, local.account_ids.prod] }
      Condition = {
        "ForAllValues:StringEquals" = {
          "oam:ResourceTypes" = ["AWS::CloudWatch::Metric", "AWS::Logs::LogGroup"]
        }
      }
    }]
  })
}

locals {
  # 공유 범위를 LiteLLM에 필요한 것으로 좁힌다. 다른 팀의 로그와 metric은 모니터링 계정에 보이지 않는다.
  oam_log_filter    = "LogGroupName LIKE '/litellm/%'"
  oam_metric_filter = "Namespace IN ('AWS/ECS', 'ECS/ContainerInsights', 'AWS/ApplicationELB', 'LiteLLM')"
}

resource "aws_oam_link" "dev" {
  provider = aws.dev
  count    = var.enable_oam ? 1 : 0

  label_template  = "$AccountName"
  resource_types  = ["AWS::CloudWatch::Metric", "AWS::Logs::LogGroup"]
  sink_identifier = aws_oam_sink.monitoring[0].arn

  link_configuration {
    log_group_configuration {
      filter = local.oam_log_filter
    }

    metric_configuration {
      filter = local.oam_metric_filter
    }
  }

  depends_on = [aws_oam_sink_policy.monitoring]
}

resource "aws_oam_link" "prod" {
  provider = aws.prod
  count    = var.enable_oam ? 1 : 0

  label_template  = "$AccountName"
  resource_types  = ["AWS::CloudWatch::Metric", "AWS::Logs::LogGroup"]
  sink_identifier = aws_oam_sink.monitoring[0].arn

  link_configuration {
    log_group_configuration {
      filter = local.oam_log_filter
    }

    metric_configuration {
      filter = local.oam_metric_filter
    }
  }

  depends_on = [aws_oam_sink_policy.monitoring]
}

# 모니터링 계정의 대시보드 하나에 dev·prod를 같이 올린다. 위젯은 방안 1과 같고 accountId만 붙는다.
module "dashboard_central" {
  source = "./modules/cloudwatch-dashboard"
  count  = var.enable_oam ? 1 : 0

  providers = {
    aws = aws.monitoring
  }

  dashboard_name = "litellm-all-accounts"
  aws_region     = var.aws_region
  cross_account  = true
  accounts       = [local.dashboard_accounts.dev, local.dashboard_accounts.prod]

  depends_on = [aws_oam_link.dev, aws_oam_link.prod]
}
