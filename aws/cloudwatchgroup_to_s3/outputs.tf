output "s3_bucket_name" {
  description = "S3 bucket name for log storage"
  value       = aws_s3_bucket.logs.id
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch Log Group name"
  value       = aws_cloudwatch_log_group.app.name
}

output "lambda_function_name" {
  description = "Lambda function name (Method 1)"
  value       = aws_lambda_function.log_to_s3.function_name
}

output "firehose_stream_name" {
  description = "Kinesis Firehose delivery stream name (Method 2)"
  value       = aws_kinesis_firehose_delivery_stream.logs.name
}
