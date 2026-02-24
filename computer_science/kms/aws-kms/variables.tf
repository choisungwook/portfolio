variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "kms-handson"
}
