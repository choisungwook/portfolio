variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnets" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "nexus_subnet_id" {
  description = "Private subnet ID for Nexus EC2"
  type        = string
}

variable "alb_allowed_cidrs" {
  description = "CIDR blocks allowed to access ALB"
  type        = list(string)
}

variable "nexus_instance_type" {
  description = "EC2 instance type for Nexus"
  type        = string
}

variable "nexus_admin_password" {
  description = "Nexus admin password"
  type        = string
  sensitive   = true
}

variable "nexus_root_volume_size" {
  description = "Root volume size for Nexus EC2 in GB"
  type        = number
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for public ALB"
  type        = string
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name"
  type        = string
}

variable "nexus_subdomain" {
  description = "Subdomain for Nexus (e.g., nexus)"
  type        = string
}

variable "nexus_internal_subdomain" {
  description = "Subdomain for internal Nexus (e.g., nexus-internal)"
  type        = string
  default     = "nexus-internal"
}

variable "private_acm_certificate_arn" {
  description = "ACM certificate ARN for private ALB"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "private_subnets" {
  description = "Private subnet IDs for Private ALB and CodeBuild"
  type        = list(string)
}
