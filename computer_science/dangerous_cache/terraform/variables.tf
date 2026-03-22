variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "dangerous-cache"
}

variable "instance_type" {
  description = "EC2 instance type (t4g Graviton preferred)"
  type        = string
  default     = "t4g.small"
}

variable "os_type" {
  description = "Operating system type for EC2 instances"
  type        = string
  default     = "al2023"

  validation {
    condition     = var.os_type == "al2023"
    error_message = "Only al2023 is supported (user_data uses yum)."
  }
}

variable "arch" {
  description = "CPU architecture for EC2 AMI (arm64 for Graviton, x86_64 for Intel/AMD)"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "Architecture must be arm64 or x86_64."
  }
}

variable "ebs_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 30
}

variable "key_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
  default     = null
}
