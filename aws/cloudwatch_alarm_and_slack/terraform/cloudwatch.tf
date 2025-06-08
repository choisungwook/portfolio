resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${var.rds_cluster_identifier}-cpu-utilization-high"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60 # 60 seconds
  statistic           = "Average"
  threshold           = 60 # 60% CPU utilization
  alarm_description   = "Alarm when RDS CPU utilization exceeds 60%"
  treat_missing_data  = "missing" # How to treat missing data points

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.aurora_cluster.id
  }

  alarm_actions = [aws_sns_topic.rds_alarms_topic.arn] # Notify SNS topic when alarm state is reached
  ok_actions    = [aws_sns_topic.rds_alarms_topic.arn] # Notify SNS topic when alarm state returns to OK (resolved)

  tags = var.common_tags
}
