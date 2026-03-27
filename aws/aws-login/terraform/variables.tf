variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "aws-login-handson"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "iam_username" {
  description = "IAM user name for aws login handson"
  type        = string
  default     = "test-developer"
}
