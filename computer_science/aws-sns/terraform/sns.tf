resource "aws_sns_topic" "example" {
  name = "${var.project_name}-topic"

  tags = {
    Name = "${var.project_name}-topic"
  }
}

resource "aws_sqs_queue" "subscriber" {
  name                       = "${var.project_name}-subscriber-queue"
  message_retention_seconds  = 86400
  visibility_timeout_seconds = 30

  tags = {
    Name = "${var.project_name}-subscriber-queue"
  }
}

resource "aws_sqs_queue_policy" "allow_sns" {
  queue_url = aws_sqs_queue.subscriber.url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSPublish"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.subscriber.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.example.arn
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "sqs" {
  topic_arn = aws_sns_topic.example.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.subscriber.arn
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.example.arn
  protocol  = "email"
  endpoint  = var.email_address
}
