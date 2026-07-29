data "aws_iam_policy_document" "assume_ecs_tasks" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# 실행 role: 이미지 pull, 로그 전송, SSM secret 주입에 쓴다.
resource "aws_iam_role" "execution" {
  name               = "${var.project_name}-execution"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "inject_secrets" {
  statement {
    actions = ["ssm:GetParameters"]
    resources = [
      aws_ssm_parameter.webhook_secret.arn,
      aws_ssm_parameter.github_token.arn,
    ]
  }
}

resource "aws_iam_role_policy" "inject_secrets" {
  name   = "inject-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.inject_secrets.json
}

# task role: 컨테이너 안의 terraform이 AWS 리소스를 만들 때 쓴다.
resource "aws_iam_role" "task" {
  name               = "${var.project_name}-task"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
}

resource "aws_iam_role_policy_attachment" "task" {
  for_each = toset(var.task_role_policy_arns)

  role       = aws_iam_role.task.name
  policy_arn = each.value
}
