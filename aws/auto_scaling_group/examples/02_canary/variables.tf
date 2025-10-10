variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "goployer-example"
}

variable "project_tag" {
  description = "Project tag"
  type        = string
  default     = "practice"
}

variable "environment" {
  description = "Environment tag"
  type        = string
  default     = "poc"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.small"
}

variable "ebs_volume_size" {
  description = "EBS volume size in GB"
  type        = number
  default     = 30
}

variable "ebs_volume_type" {
  description = "EBS volume type"
  type        = string
  default     = "gp3"
}

variable "ami_id" {
  description = "AMI ID for EC2 instances (ARM64 for t4g)"
  type        = string
  default     = ""
}
