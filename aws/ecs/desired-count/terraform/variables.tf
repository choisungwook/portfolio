variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "ecs-desired-count"
}

variable "desired_count" {
  description = "Number of tasks the ECS service scheduler keeps running"
  type        = number
  default     = 1
}

variable "observe_counts" {
  description = "Read live desired/running/pending counts through the aws_ecs_service data source"
  type        = bool
  default     = false
}
