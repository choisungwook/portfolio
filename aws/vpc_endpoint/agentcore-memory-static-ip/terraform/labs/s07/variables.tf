variable "project_name" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,14}[a-z0-9]$", var.project_name))
    error_message = "Use 3-16 lowercase letters, digits or hyphens."
  }
}
variable "vpc_id" { type = string }
variable "subnets" {
  type = map(string)
  validation {
    condition = length(var.subnets) > 0 && alltrue([
      for az in keys(var.subnets) : can(regex("^ap-northeast-2[a-d]$", az))
    ])
    error_message = "Map one or more Seoul AZs to existing subnet IDs."
  }
}
variable "client_cidrs" {
  description = "Source IPv4 CIDRs for public NLB TCP 443; the lab defaults to all IPv4 clients."
  type        = set(string)
  default     = ["0.0.0.0/0"]
  validation {
    condition = length(var.client_cidrs) > 0 && alltrue([
      for cidr in var.client_cidrs : can(cidrnetmask(cidr))
    ])
    error_message = "Provide at least one valid IPv4 CIDR."
  }
}
variable "trusted_principal_arn" {
  description = "IAM user/role behind the client's starting credentials; not the new lab role or STS session ARN."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:(user|role)/.+$", var.trusted_principal_arn))
    error_message = "Provide an existing IAM user/role ARN, not a session ARN."
  }
}
variable "proxy_domain" {
  description = "Own-domain name of the CONNECT proxy, inside route53_zone_id. Set in terraform.tfvars."
  type        = string
}
variable "route53_zone_id" {
  description = "Authoritative Route 53 zone for proxy_domain, or null when the A record lives in another DNS provider."
  type        = string
  default     = null
}
variable "acm_certificate_arn" {
  type = string
  validation {
    condition     = can(regex("^arn:aws:acm:ap-northeast-2:", var.acm_certificate_arn))
    error_message = "Use a Seoul ACM certificate matching proxy_domain."
  }
}
variable "nlb_private_ips" {
  type    = map(string)
  default = {}
}
variable "os_type" {
  type    = string
  default = "al2023"
}
