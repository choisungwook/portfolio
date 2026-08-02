variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "ecs-fundamentals"
}

variable "arch" {
  description = "CPU architecture for the container instance and task images"
  type        = string
  default     = "arm64"
}

variable "instance_type" {
  description = "Instance type for the ECS container instance (EC2 launch type)"
  type        = string
  default     = "t4g.small"
}
