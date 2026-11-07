data "archive_file" "prober" {
  type        = "zip"
  source_file = "${path.module}/../prober/prober.py"
  output_path = "${path.module}/.build/prober.zip"
}

resource "aws_cloudwatch_log_group" "prober" {
  name              = "/aws/lambda/${var.project_name}-prober"
  retention_in_days = 1
}

# 1분마다 실행되어 약 55초 동안 app API를 probe_interval_seconds 간격으로 호출한다.
resource "aws_lambda_function" "prober" {
  function_name    = "${var.project_name}-prober"
  role             = aws_iam_role.prober.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "prober.handler"
  filename         = data.archive_file.prober.output_path
  source_code_hash = data.archive_file.prober.output_base64sha256
  timeout          = 60
  memory_size      = 128

  vpc_config {
    subnet_ids         = [data.aws_subnet.app.id]
    security_group_ids = [aws_security_group.prober.id]
  }

  environment {
    variables = {
      TARGET_URL       = "http://${aws_instance.app.private_ip}:${var.app_port}/api/items"
      INTERVAL_SECONDS = tostring(var.probe_interval_seconds)
      METRIC_NAMESPACE = var.project_name
    }
  }

  depends_on = [aws_cloudwatch_log_group.prober, aws_iam_role_policy_attachment.prober_vpc]
}

resource "aws_scheduler_schedule" "prober" {
  name                = "${var.project_name}-prober"
  schedule_expression = "rate(1 minute)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.prober.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
