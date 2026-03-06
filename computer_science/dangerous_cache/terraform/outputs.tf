output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.main.id
}

output "alb_dns_name" {
  description = "ALB DNS name (direct backend access for comparison)"
  value       = aws_lb.backend.dns_name
}

output "s3_bucket_name" {
  description = "S3 bucket name for frontend files"
  value       = aws_s3_bucket.frontend.id
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.backend.id
}

output "alb_target_group_arn" {
  description = "ARN of the backend ALB target group"
  value       = aws_lb_target_group.backend.arn
}
