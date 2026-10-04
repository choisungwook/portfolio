resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = var.log_retention_in_days
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.project_name}-deploy"
  retention_in_days = var.log_retention_in_days
}

resource "aws_cloudwatch_log_group" "hook" {
  name              = "/aws/lambda/${var.project_name}-hook"
  retention_in_days = var.log_retention_in_days
}
