output "alb_dns_name" {
  description = "Internet-facing ALB endpoint"
  value       = aws_lb.this.dns_name
}

output "asg_name" {
  description = "ASG name for describe-warm-pool and describe-scaling-activities"
  value       = aws_autoscaling_group.app.name
}
