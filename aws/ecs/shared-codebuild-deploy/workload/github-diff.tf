# GitHub Actions가 PR에 task definition diff를 남길 때 쓰는 읽기 전용 role
resource "aws_iam_openid_connect_provider" "github" {
  count = var.existing_github_oidc_provider_arn == null ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  github_oidc_provider_arn = var.existing_github_oidc_provider_arn == null ? aws_iam_openid_connect_provider.github[0].arn : var.existing_github_oidc_provider_arn
}

resource "aws_iam_role" "github_task_diff" {
  name = "${local.lab.project_name}-github-diff"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # pull_request 이벤트, 그리고 기본 branch에서 실행되는 issue_comment 이벤트만 허용
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_repository}:pull_request",
            "repo:${var.github_repository}:ref:refs/heads/${var.github_default_branch}",
          ]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_task_diff" {
  name = "describe-lab-services"
  role = aws_iam_role.github_task_diff.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices"]
        Resource = [for service in local.lab.service_names : "arn:aws:ecs:${local.lab.aws_region}:${local.lab.account_id}:service/${local.lab.cluster_name}/${service}"]
      },
      {
        # DescribeTaskDefinition은 리소스 수준 제한 미지원
        Effect   = "Allow"
        Action   = ["ecs:DescribeTaskDefinition"]
        Resource = "*"
      }
    ]
  })
}
