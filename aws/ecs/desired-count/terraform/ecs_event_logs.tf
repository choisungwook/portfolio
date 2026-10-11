locals {
  # arn:aws:ecs:<region>:<account>:cluster/<name>
  ecs_arn_prefix = split(":cluster/", aws_ecs_cluster.this.arn)[0]
  account_id     = split(":", aws_ecs_cluster.this.arn)[4]
}

# Event capture: the console Event history tab queries this exact log group name.
resource "aws_cloudwatch_log_group" "ecs_events" {
  name              = "/aws/events/ecs/containerinsights/${aws_ecs_cluster.this.name}/performance"
  retention_in_days = 1
}

resource "aws_cloudwatch_event_rule" "ecs_events" {
  name        = "${var.project_name}-ecs-events"
  description = "Capture ECS events of this cluster for the console Event history tab"

  # Task, service action, deployment and container instance events carry an ARN that embeds the cluster name.
  event_pattern = jsonencode({
    source = ["aws.ecs"]
    resources = [for type in ["task", "service", "container-instance"] : {
      prefix = "${local.ecs_arn_prefix}:${type}/${aws_ecs_cluster.this.name}/"
    }]
  })
}

resource "aws_cloudwatch_event_target" "ecs_events" {
  rule = aws_cloudwatch_event_rule.ecs_events.name
  arn  = aws_cloudwatch_log_group.ecs_events.arn

  depends_on = [aws_cloudwatch_log_resource_policy.ecs_logs]
}

# Action Logs: vended log delivery from the cluster to CloudWatch Logs.
resource "aws_cloudwatch_log_group" "action_logs" {
  name              = "/aws/vendedlogs/ecs/action-logs/${aws_ecs_cluster.this.name}"
  retention_in_days = 1
}

resource "aws_cloudwatch_log_delivery_source" "action_logs" {
  name         = "${var.project_name}-action-logs"
  log_type     = "ACTION_LOGS"
  resource_arn = aws_ecs_cluster.this.arn
}

resource "aws_cloudwatch_log_delivery_destination" "action_logs" {
  name          = "${var.project_name}-action-logs"
  output_format = "json"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.action_logs.arn
  }
}

resource "aws_cloudwatch_log_delivery" "action_logs" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.action_logs.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.action_logs.arn

  # With a matching policy in place, CreateDelivery does not append this log group
  # to the account-wide AWSLogDeliveryWrite policy, which destroy would leave behind.
  depends_on = [aws_cloudwatch_log_resource_policy.ecs_logs]
}

# One account-level policy so destroy removes the write permission together with the log groups.
resource "aws_cloudwatch_log_resource_policy" "ecs_logs" {
  policy_name = "${var.project_name}-ecs-logs"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EventBridgeToEventCapture"
        Effect    = "Allow"
        Principal = { Service = ["events.amazonaws.com", "delivery.logs.amazonaws.com"] }
        Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource  = "${aws_cloudwatch_log_group.ecs_events.arn}:*"
      },
      {
        Sid       = "ActionLogsDelivery"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource  = "${aws_cloudwatch_log_group.action_logs.arn}:log-stream:*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:logs:${var.aws_region}:${local.account_id}:*" }
        }
      },
    ]
  })
}
