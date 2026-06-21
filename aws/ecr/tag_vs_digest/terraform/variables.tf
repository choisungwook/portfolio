variable "aws_region" {
  description = "AWS region for the ECR lifecycle digest hands-on."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for default resource naming and tagging."
  type        = string
  default     = "ecr-lifecycle-digest-hands-on"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,60}[a-z0-9]$", var.project_name))
    error_message = "project_name must use lowercase letters, numbers, and hyphens."
  }
}

variable "repository_name" {
  description = "ECR repository name. Leave null to use project_name."
  type        = string
  default     = null

  validation {
    condition     = var.repository_name == null ? true : can(regex("^[a-z0-9]+(?:[._/-][a-z0-9]+)*$", var.repository_name))
    error_message = "repository_name must be a valid ECR repository name."
  }
}

variable "force_delete" {
  description = "Delete the repository even when it contains images. Useful for this hands-on, risky for production."
  type        = bool
  default     = true
}

variable "enable_lifecycle_policy" {
  description = "Create the lifecycle policy. Keep false while testing direct tag deletion."
  type        = bool
  default     = false
}

variable "enable_prod_guard_rule" {
  description = "Create a high-priority v* guard rule before the d* cleanup rule."
  type        = bool
  default     = true
}

variable "dev_image_count" {
  description = "Number of d* images to retain."
  type        = number
  default     = 10

  validation {
    condition     = var.dev_image_count > 0
    error_message = "dev_image_count must be greater than 0."
  }
}

variable "prod_guard_image_count" {
  description = "High v* image count used as a lifecycle guard."
  type        = number
  default     = 9999

  validation {
    condition     = var.prod_guard_image_count > 0
    error_message = "prod_guard_image_count must be greater than 0."
  }
}
