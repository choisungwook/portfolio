
output "rds_cluster_endpoint" {
  description = "The connection endpoint for the RDS Aurora cluster (writer instance)"
  value       = aws_rds_cluster.aurora_cluster.endpoint
}

output "rds_cluster_port" {
  description = "The connection port for the RDS Aurora cluster"
  value       = aws_rds_cluster.aurora_cluster.port
}

output "lambda_function_name_output" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.slack_notifier.function_name
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for RDS alarms"
  value       = aws_sns_topic.rds_alarms_topic.arn
}

output "cloudwatch_alarm_name" {
  description = "Name of the CloudWatch alarm for RDS CPU utilization"
  value       = aws_cloudwatch_metric_alarm.rds_cpu_high.alarm_name
}

output "vpc_id" {
  description = "VPC ID where the resources are deployed"
  value       = module.vpc.vpc_id
}
