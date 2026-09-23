# AMG는 workspace 전용 role로 두 저장소를 조회한다. ECS Grafana와 권한은 같고 주체만 다르다.
# 로그인은 IAM Identity Center다. 그 달에 로그인한 사용자마다 license가 붙는다.
data "aws_iam_policy_document" "amg_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["grafana.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "amg" {
  count              = local.amg ? 1 : 0
  name               = "${var.project_name}-amg"
  assume_role_policy = data.aws_iam_policy_document.amg_assume.json
}

resource "aws_iam_role_policy" "amg" {
  count  = local.amg ? 1 : 0
  name   = "query-metrics"
  role   = aws_iam_role.amg[0].id
  policy = data.aws_iam_policy_document.grafana.json
}

resource "aws_grafana_workspace" "this" {
  count                    = local.amg ? 1 : 0
  name                     = var.project_name
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "CUSTOMER_MANAGED"
  role_arn                 = aws_iam_role.amg[0].arn
  grafana_version          = "12.4"
  data_sources             = ["PROMETHEUS", "CLOUDWATCH"]
}

# Identity Center 사용자를 Admin으로 배정한다. 비워 두면 콘솔에서 배정한다.
resource "aws_grafana_role_association" "admin" {
  count        = local.amg && length(var.amg_admin_user_ids) > 0 ? 1 : 0
  workspace_id = aws_grafana_workspace.this[0].id
  role         = "ADMIN"
  user_ids     = var.amg_admin_user_ids
}
