variable "aws_region" {
  type        = string
  default     = "ap-northeast-2"
  description = "AWS region to build the AMI in"
}

variable "eks_version" {
  type        = string
  default     = "1.35"
  description = "EKS Kubernetes version (e.g., 1.35)"
}

variable "instance_type" {
  type        = string
  default     = "t3.medium"
  description = "EC2 instance type for the builder (must be x86_64)"
}

variable "volume_size" {
  type        = number
  default     = 30
  description = "Root EBS volume size in GB"
}

variable "ami_name_prefix" {
  type        = string
  default     = "eks-custom-ami"
  description = "Prefix for the output AMI name"
}

variable "project_name" {
  type        = string
  default     = "eks-custom-ami"
  description = "Project name for tagging"
}
