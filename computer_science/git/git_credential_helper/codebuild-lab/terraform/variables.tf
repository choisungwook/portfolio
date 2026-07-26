variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for AWS resource names"
  type        = string
  default     = "git-credential-helper-handson"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "github_org" {
  description = "GitHub organization that owns the a and b repositories"
  type        = string
}

variable "repo_a_name" {
  description = "Repository cloned by CodeBuild as the build source"
  type        = string
  default     = "a"
}

variable "repo_b_name" {
  description = "Repository cloned inside the build by the shell script in repo a"
  type        = string
  default     = "b"
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
