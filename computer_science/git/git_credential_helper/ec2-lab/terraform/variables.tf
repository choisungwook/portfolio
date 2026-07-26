variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for AWS resource names"
  type        = string
  default     = "git-credential-helper-lab"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "instance_type" {
  description = "EC2 instance type. Graviton으로 비용을 줄인다"
  type        = string
  default     = "t4g.small"
}

variable "arch" {
  description = "CPU architecture for the AMI lookup"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "arch must be arm64 or x86_64."
  }
}

variable "ebs_size" {
  description = "Root EBS volume size in GiB"
  type        = number
  default     = 30
}

variable "token_parameter_name" {
  description = "실습용 GitHub 토큰을 담아 둘 SSM Parameter 이름. 값은 Terraform이 만들지 않고 사람이 직접 넣는다"
  type        = string
  default     = "/git-credential-helper-lab/github-token"
}
