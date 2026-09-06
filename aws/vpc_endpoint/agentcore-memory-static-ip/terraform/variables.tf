variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
  validation {
    condition     = var.aws_region == "ap-northeast-2"
    error_message = "This lab uses the Seoul Region only."
  }
}

variable "project_name" {
  type    = string
  default = "memory-static-ip"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,17}[a-z0-9]$", var.project_name))
    error_message = "Use 2-19 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "availability_zones" {
  type    = set(string)
  default = ["ap-northeast-2a"]
  validation {
    condition = length(var.availability_zones) > 0 && alltrue([
      for az in var.availability_zones : can(regex("^ap-northeast-2[a-d]$", az))
    ])
    error_message = "Choose at least one Seoul AZ with a default subnet and both endpoint services."
  }
}

variable "allowed_client_cidrs" {
  description = "Source IPv4 CIDRs for public NLB TCP 443; the lab defaults to all IPv4 clients."
  type        = set(string)
  default     = ["0.0.0.0/0"]
  validation {
    condition = length(var.allowed_client_cidrs) > 0 && alltrue([
      for cidr in var.allowed_client_cidrs :
      can(cidrnetmask(cidr))
    ])
    error_message = "Provide at least one valid IPv4 CIDR."
  }
}

variable "route53_zone_id" {
  description = "Authoritative Route 53 hosted zone for sts_alias_domain, or null when the record lives in another DNS provider."
  type        = string
  default     = null
  validation {
    condition     = var.route53_zone_id == null || can(regex("^Z[A-Z0-9]{8,}$", var.route53_zone_id))
    error_message = "Provide a Route 53 hosted zone ID such as Z0123456789ABCDEFGHIJ, or null."
  }
}

variable "sts_alias_domain" {
  description = "Own-domain name that resolves to the STS NLB EIP; only the S05 TLS mismatch test uses it."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.sts_alias_domain))
    error_message = "Provide a fully qualified lowercase hostname."
  }
}

variable "trusted_principal_arn" {
  description = "Existing IAM user/role behind the client's AWS profile. It is trusted by the client role and the STS endpoint policy; no keys are created or output."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:(user|role)/.+$", var.trusted_principal_arn))
    error_message = "Provide an existing IAM user/role ARN, not an STS session ARN."
  }
}
