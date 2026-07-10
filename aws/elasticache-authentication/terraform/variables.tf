variable "aws_region" {
  description = "AWS region for the lab"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "elasticache-auth-lab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.project_name))
    error_message = "project_name must be 3-32 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "elasticache_auth_token" {
  description = "AUTH token used during the password and IAM migration phases"
  type        = string
  sensitive   = true
  default     = null

  validation {
    condition     = var.elasticache_auth_token == null || can(regex("^[A-Za-z0-9!&#$^<>-]{16,128}$", var.elasticache_auth_token))
    error_message = "The AUTH token must contain 16-128 alphanumeric characters or !, &, #, $, ^, <, >, -."
  }
}

variable "migration_phase" {
  description = "Authentication migration phase"
  type        = string
  default     = "unauthenticated"

  validation {
    condition = contains([
      "unauthenticated",
      "auth_overlap",
      "auth_required",
      "rbac_overlap",
      "iam_required",
    ], var.migration_phase)
    error_message = "migration_phase must be unauthenticated, auth_overlap, auth_required, rbac_overlap, or iam_required."
  }
}

variable "iam_user_name" {
  description = "ElastiCache IAM user ID and user name"
  type        = string
  default     = "elasticache-iam-client"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,39}$", var.iam_user_name))
    error_message = "iam_user_name must be 3-40 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "app_instance_type" {
  description = "EC2 instance type for the app host that runs the client containers"
  type        = string
  default     = "t4g.small"
}

variable "hurl_version" {
  description = "Hurl release installed on the app host for the cache gate"
  type        = string
  default     = "8.0.1"
}

variable "cache_node_type" {
  description = "ElastiCache node type for the lab"
  type        = string
  default     = "cache.t4g.micro"
}

variable "arch" {
  description = "Architecture of the app host EC2 instance"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "arch must be arm64 or x86_64."
  }
}
