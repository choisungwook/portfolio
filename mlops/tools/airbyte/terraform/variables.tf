variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "airbyte-practice"
}

variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_service_account_email" {
  description = "GCP Service Account Email for GCS access"
  type        = string
}
