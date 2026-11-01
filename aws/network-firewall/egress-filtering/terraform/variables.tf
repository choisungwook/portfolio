variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "nfw-lab"
}

variable "arch" {
  description = "EC2 architecture: arm64 or x86_64"
  type        = string
  default     = "arm64"
}

variable "instance_type" {
  description = "EC2 instance type. Use t3.medium with arch = x86_64"
  type        = string
  default     = "t4g.medium"
}
