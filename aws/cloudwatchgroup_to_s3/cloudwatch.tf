# CloudWatch Log Group - 두 방법 모두 같은 log group 사용
resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.project_name}/app"
  retention_in_days = 1

  tags = {
    Name = "${var.project_name}-app-log-group"
  }
}
