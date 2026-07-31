variable "project_name" {
  description = "Tag and resource name prefix"
  type        = string
  default     = "akbun-terraform-apply-remote"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "arch" {
  description = "Instance architecture: arm64 or x86_64"
  type        = string
  default     = "arm64"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.small"
}

variable "binary_url" {
  description = "URL of the linux server binary. The instance downloads it at boot and the self-update timer polls it; publishing a new binary here is a deployment."
  type        = string
}

variable "terraform_version" {
  description = "Terraform version installed on the instance"
  type        = string
  default     = "1.15.8"
}

variable "webhook_secret" {
  description = "GitHub webhook secret. Stored as an SSM SecureString parameter."
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub API token for the server. Stored as an SSM SecureString parameter."
  type        = string
  sensitive   = true
}

variable "trigger_word" {
  description = "Comment trigger word for plan/apply commands"
  type        = string
  default     = "terraform"
}

variable "server_port" {
  description = "Port the webhook server listens on"
  type        = number
  default     = 4141
}
