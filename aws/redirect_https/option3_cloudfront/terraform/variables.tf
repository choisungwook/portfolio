variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

variable "route53_zone_id" {
  description = "Pre-existing Route53 hosted zone ID"
  type        = string
}

variable "s3_hosting_domain" {
  description = "Domain name for S3 web hosting via CloudFront (existing site)"
  type        = string
}

variable "redirect_source_domain" {
  description = "Domain name that redirects to s3_hosting_domain"
  type        = string
}

variable "acm_certificate_arn" {
  description = "Pre-existing ACM certificate ARN in us-east-1 (must cover both domains)"
  type        = string
}

variable "enable_redirect" {
  description = "Phase 2: add redirect_source_domain alias and CloudFront Function"
  type        = bool
  default     = false
}
