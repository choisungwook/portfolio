output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.static_website.bucket
}

output "s3_bucket_website_endpoint" {
  description = "Website endpoint for the S3 bucket"
  value       = aws_s3_bucket_website_configuration.static_website.website_endpoint
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.static_website.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.static_website.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID"
  value       = aws_cloudfront_distribution.static_website.hosted_zone_id
}

output "certificate_arn" {
  description = "ARN of the existing ACM certificate"
  value       = data.aws_acm_certificate.cloudfront_cert.arn
}

output "domains" {
  description = "List of domains configured for the CloudFront distribution"
  value       = var.domains
}
output "uploaded_files_count" {
  description = "Number of files uploaded to S3"
  value       = length(aws_s3_object.static_files)
}

output "manual_deployment_commands" {
  description = "Manual commands to deploy the React application (if not using Terraform)"
  value = [
    "# Build the React application:",
    "npm run build",
    "",
    "# Sync files to S3:",
    "aws s3 sync dist/ s3://${aws_s3_bucket.static_website.bucket}/ --delete",
    "",
    "# Invalidate CloudFront cache:",
    "aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.static_website.id} --paths '/*'"
  ]
}
