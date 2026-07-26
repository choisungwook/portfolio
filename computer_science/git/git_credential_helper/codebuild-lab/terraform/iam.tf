data "aws_iam_policy_document" "codebuild_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "codebuild" {
  name               = "${var.project_name}-role"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume_role.json

  tags = {
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "codebuild" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]

    resources = [
      "arn:aws:logs:${var.aws_region}:*:log-group:/aws/codebuild/${var.project_name}",
      "arn:aws:logs:${var.aws_region}:*:log-group:/aws/codebuild/${var.project_name}:*"
    ]
  }

  # GetConnectionToken이 있어야 build 안의 git-credential-helper가 토큰을 받아온다.
  statement {
    effect = "Allow"

    actions = [
      "codeconnections:GetConnection",
      "codeconnections:GetConnectionToken",
      "codeconnections:UseConnection"
    ]

    resources = [aws_codeconnections_connection.github.arn]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  name   = "${var.project_name}-policy"
  role   = aws_iam_role.codebuild.id
  policy = data.aws_iam_policy_document.codebuild.json
}
