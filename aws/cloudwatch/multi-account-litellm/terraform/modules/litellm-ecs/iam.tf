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
  name               = "${local.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions = ["ssm:GetParameters"]
    resources = [
      aws_ssm_parameter.master_key.arn,
      aws_ssm_parameter.database_url.arn,
      aws_ssm_parameter.db_password.arn,
    ]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

# 수집기 task role. 이름이 고정이라 모니터링 계정의 AMP role이 이 이름으로 신뢰를 건다.
resource "aws_iam_role" "collector" {
  name               = "${local.name}-collector"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "collector" {
  statement {
    sid = "WriteEmf"
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:DescribeLogGroups",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.emf.arn}:*", aws_cloudwatch_log_group.emf.arn]
  }

  dynamic "statement" {
    for_each = var.remote_write_amp == null ? [] : [var.remote_write_amp.role_arn]

    content {
      sid       = "AssumeAmpWriter"
      actions   = ["sts:AssumeRole"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_role_policy" "collector" {
  name   = "collector"
  role   = aws_iam_role.collector.id
  policy = data.aws_iam_policy_document.collector.json
}
