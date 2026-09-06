variable "project_name" { type = string }
variable "vpc_id" { type = string }
variable "subnets" { type = map(string) }
variable "client_cidrs" { type = set(string) }
variable "services" { type = map(any) }
variable "endpoint_security_group_id" { type = string }
variable "scheme" {
  type = string
  validation {
    condition     = contains(["internal", "internet-facing"], var.scheme)
    error_message = "Use internal or internet-facing."
  }
}
variable "nlb_private_ips" { type = map(string) }
variable "route53_zone_id" {
  description = "Authoritative Route 53 zone for proxy_domain, or null when the A record lives in another DNS provider."
  type        = string
  default     = null
}
variable "proxy_domain" { type = string }
variable "acm_certificate_arn" { type = string }
variable "arch" {
  type    = string
  default = "arm64"
}
variable "os_type" {
  type    = string
  default = "al2023"
  validation {
    condition     = contains(["al2023", "ubuntu"], var.os_type)
    error_message = "Use al2023 or ubuntu."
  }
}
