variable "aws_region" {
  description = "AWS region for the ECS LiteLLM hands-on."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names."
  type        = string
  default     = "litellm-proxy-hands-on"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,50}[a-z0-9]$", var.project_name))
    error_message = "project_name must use lowercase letters, numbers, and hyphens."
  }
}

variable "vpc_id" {
  description = "VPC ID where the ALB and ECS service run."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB and Fargate tasks."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "public_subnet_ids must include at least two subnets."
  }
}

variable "allowed_cidr" {
  description = "CIDR allowed to access the ALB. Narrow this before real use."
  type        = string
  default     = "0.0.0.0/0"
}

variable "container_image" {
  description = "LiteLLM ECS image URI. Build and push ecs-image before applying."
  type        = string
}

variable "litellm_master_key_secret_arn" {
  description = "Secrets Manager secret ARN containing LITELLM_MASTER_KEY."
  type        = string
}

variable "container_port" {
  description = "LiteLLM proxy port."
  type        = number
  default     = 4000
}

variable "desired_count" {
  description = "Number of ECS tasks."
  type        = number
  default     = 1
}

variable "cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}
