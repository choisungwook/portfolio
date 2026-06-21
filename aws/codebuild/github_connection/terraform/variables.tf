variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for AWS resource names"
  type        = string
  default     = "codebuild-github-connection"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "github_connection_arn" {
  description = "GitHub App connection ARN created manually in AWS CodeConnections"
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-zA-Z-]*:codeconnections:", var.github_connection_arn))
    error_message = "github_connection_arn must be an AWS CodeConnections connection ARN."
  }
}

variable "github_repository_url" {
  description = "Private GitHub repository HTTPS clone URL used as the CodeBuild source"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch or ref used by CodeBuild"
  type        = string
  default     = "main"
}

variable "codebuild_compute_type" {
  description = "CodeBuild compute type"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "codebuild_image" {
  description = "CodeBuild managed image"
  type        = string
  default     = "aws/codebuild/amazonlinux-x86_64-standard:6.0"
}
