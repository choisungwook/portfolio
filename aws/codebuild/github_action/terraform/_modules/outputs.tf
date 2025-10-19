output "alb_id" {
  description = "ALB ID"
  value       = aws_lb.nexus.id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.nexus.arn
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.nexus.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID for Route53"
  value       = aws_lb.nexus.zone_id
}

output "nexus_instance_id" {
  description = "Nexus EC2 instance ID"
  value       = aws_instance.nexus.id
}

output "nexus_private_ip" {
  description = "Nexus EC2 private IP"
  value       = aws_instance.nexus.private_ip
}

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

output "nexus_security_group_id" {
  description = "Nexus EC2 security group ID"
  value       = aws_security_group.nexus_ec2.id
}

output "nexus_url" {
  description = "Nexus URL"
  value       = "https://${aws_route53_record.nexus.name}"
}

output "nexus_internal_url" {
  description = "Nexus internal URL"
  value       = "https://${aws_route53_record.nexus_internal.name}"
}

output "private_alb_dns_name" {
  description = "Private ALB DNS name"
  value       = aws_lb.nexus_private.dns_name
}
