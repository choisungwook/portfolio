resource "aws_sqs_queue" "example" {
  name                       = "${var.project_name}-queue"
  message_retention_seconds  = 86400
  visibility_timeout_seconds = 30
  receive_wait_time_seconds  = 10

  tags = {
    Name = "${var.project_name}-queue"
  }
}
