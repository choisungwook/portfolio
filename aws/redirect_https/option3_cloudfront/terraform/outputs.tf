output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.main.id
}

output "s3_hosting_url" {
  description = "S3 hosting URL (Phase 1)"
  value       = "https://${var.s3_hosting_domain}"
}

output "redirect_source_url" {
  description = "Redirect source URL (Phase 2, enable_redirect = true)"
  value       = var.enable_redirect ? "https://${var.redirect_source_domain}" : "not enabled"
}

output "s3_bucket_name" {
  description = "S3 bucket name for the origin"
  value       = aws_s3_bucket.origin.id
}
