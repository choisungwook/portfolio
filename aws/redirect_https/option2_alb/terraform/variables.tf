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

variable "domain_name" {
  description = "Domain name for the ALB (source of redirect)"
  type        = string
}

variable "redirect_target_host" {
  description = "Target host for the redirect"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type (t4g Graviton preferred)"
  type        = string
  default     = "t4g.small"
}

variable "arch" {
  description = "CPU architecture for EC2 AMI (arm64 for Graviton)"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "Architecture must be arm64 or x86_64."
  }
}
