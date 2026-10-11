locals {
  # Target tracking alarms are named TargetTracking-service/<cluster>/<service>-AlarmHigh-<uuid>.
  target_tracking_alarm_prefix = "TargetTracking-${aws_appautoscaling_target.web.resource_id}-"
}

resource "aws_sns_topic" "scaling_alerts" {
  name = "${var.project_name}-scaling-alerts"
}

resource "aws_sns_topic_policy" "scaling_alerts" {
  arn = aws_sns_topic.scaling_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EventBridgePublish"
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.scaling_alerts.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = [
            aws_cloudwatch_event_rule.scaling_alarm.arn,
            aws_cloudwatch_event_rule.scaled_to_max.arn,
          ]
        }
      }
    }]
  })
}

# Confirmation link arrives by email; the subscription stays pending until clicked.
resource "aws_sns_topic_subscription" "email" {
  count = var.alert_email == null ? 0 : 1

  topic_arn = aws_sns_topic.scaling_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Every scale-out or scale-in starts with a target tracking alarm entering ALARM.
# Alarm actions belong to Application Auto Scaling, so the alert hangs off the alarm state change event instead.
resource "aws_cloudwatch_event_rule" "scaling_alarm" {
  name        = "${var.project_name}-scaling-alarm"
  description = "Target tracking alarm of this service entered ALARM"

  event_pattern = jsonencode({
    source        = ["aws.cloudwatch"]
    "detail-type" = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = [{ prefix = local.target_tracking_alarm_prefix }]
      state     = { value = ["ALARM"] }
    }
  })
}

# Application Auto Scaling itself only emits an event when the desired count is capped at max_capacity.
resource "aws_cloudwatch_event_rule" "scaled_to_max" {
  name        = "${var.project_name}-scaled-to-max"
  description = "Application Auto Scaling capped this service at max capacity"

  event_pattern = jsonencode({
    source        = ["aws.application-autoscaling"]
    "detail-type" = ["Application Auto Scaling Scaling Activity State Change"]
    detail = {
      resourceId = [aws_appautoscaling_target.web.resource_id]
    }
  })
}

resource "aws_cloudwatch_event_target" "scaling_alarm" {
  rule = aws_cloudwatch_event_rule.scaling_alarm.name
  arn  = aws_sns_topic.scaling_alerts.arn
}

resource "aws_cloudwatch_event_target" "scaled_to_max" {
  rule = aws_cloudwatch_event_rule.scaled_to_max.name
  arn  = aws_sns_topic.scaling_alerts.arn
}
