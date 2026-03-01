variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type (t4g Graviton preferred)"
  type        = string
  default     = "t4g.medium"
}

variable "os_type" {
  description = "Operating system type for EC2 instances"
  type        = string
  default     = "al2023"

  validation {
    condition     = contains(["al2023", "ubuntu"], var.os_type)
    error_message = "OS type must be al2023 or ubuntu."
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
