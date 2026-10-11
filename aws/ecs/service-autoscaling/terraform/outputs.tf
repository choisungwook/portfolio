output "alb_dns_name" {
  description = "ALB DNS name to curl"
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
