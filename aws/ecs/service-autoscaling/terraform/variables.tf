variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "ecs-service-autoscaling"
}

variable "min_capacity" {
  description = "Minimum task count. Also the desired count on the first apply"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum task count Application Auto Scaling may set"
  type        = number
  default     = 3
}

variable "target_requests_per_task" {
  description = "Target tracking value: ALB requests per task per minute"
  type        = number
  default     = 600
}

variable "scaling_metric" {
  description = "Target tracking metric: requests (ALBRequestCountPerTarget) or cpu (ECSServiceAverageCPUUtilization)"
  type        = string
  default     = "requests"

  validation {
    condition     = contains(["requests", "cpu"], var.scaling_metric)
    error_message = "scaling_metric must be requests or cpu."
  }
}

variable "target_cpu_percent" {
  description = "Target tracking value when scaling_metric is cpu: service average CPU percent"
  type        = number
  default     = 50
}

variable "alert_email" {
  description = "Email that receives scaling alerts. Null skips the subscription"
  type        = string
  default     = null
}
