resource "aws_secretsmanager_secret" "demo" {
  name                    = "${var.project_name}/demo"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-demo"
  }
}

resource "aws_secretsmanager_secret_version" "demo" {
  secret_id = aws_secretsmanager_secret.demo.id
  secret_string = jsonencode({
    RUNTIME_SECRET_TOKEN = var.demo_secret_value
  })
}
