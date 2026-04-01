output "queue_url" {
  description = "SQS 큐 URL"
  value       = aws_sqs_queue.example.url
}

output "queue_arn" {
  description = "SQS 큐 ARN"
  value       = aws_sqs_queue.example.arn
}
