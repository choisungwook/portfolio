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

output "my_ip" {
  description = "Public IP allowed by the security groups"
  value       = local.my_ip_cidr
}

output "observed_counts" {
  description = "Live counts read by the data source when observe_counts is true"
  value = var.observe_counts ? {
    desired = data.aws_ecs_service.web[0].desired_count
    running = data.aws_ecs_service.web[0].running_count
    pending = data.aws_ecs_service.web[0].pending_count
  } : null
}
