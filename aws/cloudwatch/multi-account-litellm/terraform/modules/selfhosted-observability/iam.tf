data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "read-secrets"
  role = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ssm:GetParameters"
      Resource = aws_ssm_parameter.grafana_admin_password.arn
    }]
  })
}

resource "aws_iam_role" "victoriametrics" {
  name               = "${var.name}-victoriametrics"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "victoriametrics" {
  name = "efs-mount"
  role = aws_iam_role.victoriametrics.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"]
      Resource = aws_efs_file_system.observability.arn
    }]
  })
}

# Grafana가 CloudWatch를 읽는 role. OAM sink가 있는 계정이면 source 계정 데이터까지 조회한다.
resource "aws_iam_role" "grafana" {
  name               = "${var.name}-grafana"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "grafana_cloudwatch" {
  role       = aws_iam_role.grafana.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"
}

resource "aws_iam_role_policy" "grafana" {
  name = "grafana"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListOamLinks"
        Effect   = "Allow"
        Action   = ["oam:ListSinks", "oam:ListAttachedLinks"]
        Resource = "*"
      },
      {
        Sid      = "MountEfs"
        Effect   = "Allow"
        Action   = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"]
        Resource = aws_efs_file_system.observability.arn
      },
    ]
  })
}

# 방안 B. 같은 Grafana에서 AMP를 조회한다. datasource는 Grafana 화면에서 추가한다.
resource "aws_iam_role_policy" "grafana_amp" {
  count = var.amp_query.enabled ? 1 : 0

  name = "query-amp"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["aps:QueryMetrics", "aps:GetSeries", "aps:GetLabels", "aps:GetMetricMetadata"]
      Resource = var.amp_query.workspace_arn
    }]
  })
}
