variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones"
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "nexus_instance_type" {
  description = "EC2 instance type for Nexus"
  type        = string
  default     = "t3.medium"
}

variable "nexus_admin_password" {
  description = "Nexus admin password"
  type        = string
  sensitive   = true
}

variable "alb_allowed_cidrs" {
  description = "CIDR blocks allowed to access ALB"
  type        = list(string)
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name"
  type        = string
}

variable "acm_domain_name" {
  description = "ACM certificate domain name"
  type        = string
}

variable "nexus_subdomain" {
  description = "Subdomain for Nexus (e.g., nexus)"
  type        = string
  default     = "nexus"
}

variable "nexus_internal_subdomain" {
  description = "Subdomain for internal Nexus (e.g., nexus-internal)"
  type        = string
  default     = "nexus-internal"
}

variable "nexus_root_volume_size" {
  description = "Root volume size for Nexus EC2 in GB"
  type        = number
  default     = 30
}

variable "github_repository_url" {
  description = "GitHub repository URL"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to build"
  type        = string
  default     = "master"
}

variable "codebuild_source_identifier" {
  description = "CodeBuild source connection ARN (created manually in AWS Console)"
  type        = string
}

variable "codebuild_compute_type" {
  description = "CodeBuild Fleet compute type"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}
