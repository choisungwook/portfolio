output "alb_dns_name" {
  value = aws_lb.litellm.dns_name
}

output "alb_arn_suffix" {
  value = aws_lb.litellm.arn_suffix
}

output "target_group_arn_suffix" {
  value = aws_lb_target_group.litellm.arn_suffix
}

output "cluster_name" {
  value = aws_ecs_cluster.litellm.name
}

output "service_name" {
  value = aws_ecs_service.litellm.name
}

output "app_log_group_name" {
  value = aws_cloudwatch_log_group.app.name
}

output "app_log_group_arn" {
  value = aws_cloudwatch_log_group.app.arn
}

output "task_security_group_id" {
  value = aws_security_group.tasks.id
}

output "collector_role_arn" {
  value = aws_iam_role.collector.arn
}
