variable "route53_hosted_zone_id" {
  description = "Route53 hosted zone ID for choilab.xyz"
  type        = string
}

variable "s3_bucket_name" {
  description = "S3 bucket name for static website hosting"
  type        = string
  default     = "css-gethost-static"
}

variable "domains" {
  description = "Set of domains to use for CloudFront distribution"
  type        = set(string)
  default     = ["aaa.choilab.xyz", "bbb.choilab.xyz"]
}

variable "acm_domain_name" {
  description = "Domain name for the ACM certificate"
  type        = string
}
