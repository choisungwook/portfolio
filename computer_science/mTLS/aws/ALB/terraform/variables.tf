variable "trust_store_bucket_name" {
  description = "s3 bucket for certification"
  type        = string
}

variable "use_acm" {
  description = "Use ACM certificate"
  type        = bool
  default     = false
}

variable "acm_domain" {
  description = "ACM certificate domain"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the ALB"
  type        = string
}

variable "revocation_lists" {
  description = "Map of revocation list configurations."
  type        = any
  default = {
    root_ca = {
      revocations_s3_key = "certs/root_ca.crl"
    }
  }
}
