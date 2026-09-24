data "archive_file" "hook" {
  type        = "zip"
  source_file = "${path.module}/../hook/handler.py"
  output_path = "${path.module}/.terraform/hook.zip"
}

resource "aws_iam_role" "hook" {
  name = "${var.project_name}-hook"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "hook_logs" {
  role       = aws_iam_role.hook.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# 첫 배포(create-service)인지 판별하려고 배포 목록을 읽는다.
resource "aws_iam_role_policy" "hook_ecs" {
  name = "list-service-deployments"
  role = aws_iam_role.hook.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ecs:ListServiceDeployments"
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "hook" {
  function_name = "${var.project_name}-hook"
  role          = aws_iam_role.hook.arn
  runtime       = "python3.13"
  architectures = ["arm64"]
  handler       = "handler.handler"
  timeout       = 30

  filename         = data.archive_file.hook.output_path
  source_code_hash = data.archive_file.hook.output_base64sha256

  environment {
    variables = {
      TEST_URL = local.test_url
    }
  }

  depends_on = [aws_cloudwatch_log_group.hook]
}
