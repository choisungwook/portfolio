output "alb_dns_name" {
  description = "ALB DNS name to open in the browser"
  value       = aws_lb.web.dns_name
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.web.name
}

# Revision numbers keep counting after destroy and re-apply, so the hands-on reads them from here.
output "task_definition_revisions" {
  description = "family:revision for each scenario"
  value = {
    healthy   = "${aws_ecs_task_definition.healthy.family}:${aws_ecs_task_definition.healthy.revision}"
    bad_image = "${aws_ecs_task_definition.bad_image.family}:${aws_ecs_task_definition.bad_image.revision}"
    unhealthy = "${aws_ecs_task_definition.unhealthy.family}:${aws_ecs_task_definition.unhealthy.revision}"
  }
}
