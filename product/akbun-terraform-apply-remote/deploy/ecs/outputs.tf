output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.server.dns_name
}

output "webhook_url" {
  description = "Payload URL to register in the GitHub webhook settings"
  value       = var.route53_zone_id != "" ? "https://${var.domain_name}/events" : "https://${aws_lb.server.dns_name}/events"
}
