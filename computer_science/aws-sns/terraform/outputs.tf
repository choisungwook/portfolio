output "topic_arn" {
  description = "SNS 토픽 ARN"
  value       = aws_sns_topic.example.arn
}

output "subscriber_queue_url" {
  description = "구독용 SQS 큐 URL"
  value       = aws_sqs_queue.subscriber.url
}
