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
