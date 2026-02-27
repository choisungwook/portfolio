variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "content-aggregator"
}

variable "domain_name" {
  description = "Domain name for the Content Aggregator (e.g. weekly.akbun.com)"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository for OIDC (e.g. choisungwook/portfolio)"
  type        = string
}

variable "cloudflare_referer_secret" {
  description = "Shared secret for Cloudflare origin verification via Referer header"
  type        = string
  sensitive   = true
}
