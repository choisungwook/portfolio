output "alb_dns_name" {
  description = "LiteLLM proxy ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.litellm.name
}

output "task_role_arn" {
  description = "ECS task role ARN used for Bedrock calls."
  value       = aws_iam_role.task.arn
}
