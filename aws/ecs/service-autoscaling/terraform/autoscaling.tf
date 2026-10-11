# Registers the service's desired count as something Application Auto Scaling may change.
# The ECS service-linked role (AWSServiceRoleForApplicationAutoScaling_ECSService) is created on first use.
resource "aws_appautoscaling_target" "web" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.web.name}"
  min_capacity       = var.min_capacity
  max_capacity       = var.max_capacity
}

# One policy at a time so each scenario's alarms and alerts come from a single metric.
# Keeps ALB requests per task near the target value.
# Creates two CloudWatch alarms: AlarmHigh (3 of 3 minutes) and AlarmLow (15 of 15 minutes).
resource "aws_appautoscaling_policy" "requests_per_task" {
  count = var.scaling_metric == "requests" ? 1 : 0

  name               = "${var.project_name}-requests-per-task"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.web.service_namespace
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  resource_id        = aws_appautoscaling_target.web.resource_id

  target_tracking_scaling_policy_configuration {
    target_value = var.target_requests_per_task

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      # app/<alb-name>/<id>/targetgroup/<tg-name>/<id>
      resource_label = "${aws_lb.web.arn_suffix}/${aws_lb_target_group.web.arn_suffix}"
    }

    # Defaults are 300s. Short so both directions are observable within the hands-on.
    scale_out_cooldown = 60
    scale_in_cooldown  = 60
  }
}

# Keeps the service average CPU (AWS/ECS CPUUtilization) near the target percent.
resource "aws_appautoscaling_policy" "cpu" {
  count = var.scaling_metric == "cpu" ? 1 : 0

  name               = "${var.project_name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.web.service_namespace
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  resource_id        = aws_appautoscaling_target.web.resource_id

  target_tracking_scaling_policy_configuration {
    target_value = var.target_cpu_percent

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    scale_out_cooldown = 60
    scale_in_cooldown  = 60
  }
}
