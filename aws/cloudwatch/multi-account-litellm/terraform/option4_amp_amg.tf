# 방안 4. 저장은 AMP, 화면은 AMG. 둘 다 모니터링 계정에 만든다.
resource "aws_prometheus_workspace" "litellm" {
  provider = aws.monitoring
  count    = var.enable_amp ? 1 : 0

  alias = var.project_name
}

# 기본 보관 기간은 150일이다. 요구사항에 맞춰 줄인다.
resource "aws_prometheus_workspace_configuration" "litellm" {
  provider = aws.monitoring
  count    = var.enable_amp ? 1 : 0

  workspace_id             = aws_prometheus_workspace.litellm[0].id
  retention_period_in_days = var.metrics_retention_days
}

# dev·prod 수집기가 assume하는 role. 네트워크 연결 없이 IAM만으로 계정을 넘는다.
data "aws_iam_policy_document" "amp_writer_trust" {
  provider = aws.monitoring
  count    = var.enable_amp ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.account_ids.dev}:root", "arn:aws:iam::${local.account_ids.prod}:root"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:PrincipalArn"
      values = [
        "arn:aws:iam::${local.account_ids.dev}:role/${var.project_name}-dev-collector",
        "arn:aws:iam::${local.account_ids.prod}:role/${var.project_name}-prod-collector",
      ]
    }
  }
}

resource "aws_iam_role" "amp_writer" {
  provider = aws.monitoring
  count    = var.enable_amp ? 1 : 0

  name               = local.amp_writer_role_name
  assume_role_policy = data.aws_iam_policy_document.amp_writer_trust[0].json
}

resource "aws_iam_role_policy" "amp_writer" {
  provider = aws.monitoring
  count    = var.enable_amp ? 1 : 0

  name = "remote-write"
  role = aws_iam_role.amp_writer[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "aps:RemoteWrite"
      Resource = aws_prometheus_workspace.litellm[0].arn
    }]
  })
}

# ---------- Amazon Managed Grafana ----------
# 로그인은 IAM Identity Center로 한다. 사용자 배정은 콘솔에서 한다.
data "aws_iam_policy_document" "grafana_trust" {
  provider = aws.monitoring
  count    = var.enable_amg ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["grafana.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_ids.monitoring]
    }
  }
}

resource "aws_iam_role" "amg" {
  provider = aws.monitoring
  count    = var.enable_amg ? 1 : 0

  name               = "${var.project_name}-amg"
  assume_role_policy = data.aws_iam_policy_document.grafana_trust[0].json
}

resource "aws_iam_role_policy_attachment" "amg_cloudwatch" {
  provider = aws.monitoring
  count    = var.enable_amg ? 1 : 0

  role       = aws_iam_role.amg[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonGrafanaCloudWatchAccess"
}

resource "aws_iam_role_policy_attachment" "amg_prometheus" {
  provider = aws.monitoring
  count    = var.enable_amg ? 1 : 0

  role       = aws_iam_role.amg[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonPrometheusQueryAccess"
}

resource "aws_iam_role_policy" "amg_oam" {
  provider = aws.monitoring
  count    = var.enable_amg ? 1 : 0

  name = "list-oam-links"
  role = aws_iam_role.amg[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["oam:ListSinks", "oam:ListAttachedLinks"]
      Resource = "*"
    }]
  })
}

resource "aws_grafana_workspace" "litellm" {
  provider = aws.monitoring
  count    = var.enable_amg ? 1 : 0

  name                     = var.project_name
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "CUSTOMER_MANAGED"
  role_arn                 = aws_iam_role.amg[0].arn
  data_sources             = ["CLOUDWATCH", "PROMETHEUS"]
  grafana_version          = "12.4"
}
