# nginx ALB outputs
output "nginx_alb_dns_name" {
  description = "Nginx ALB DNS name"
  value       = aws_lb.nginx.dns_name
}

# redirect ALB outputs
output "redirect_alb_dns_name" {
  description = "Redirect ALB DNS name"
  value       = aws_lb.redirect.dns_name
}

output "domain_url" {
  description = "Access URL for the redirect service"
  value       = "http://${var.domain_name}"
}

output "redirect_target" {
  description = "Redirect target URL"
  value       = "https://${var.redirect_target_host}"
}

output "ec2_instance_id" {
  description = "EC2 instance ID (can be removed after migration to ALB redirect)"
  value       = aws_instance.nginx.id
}
