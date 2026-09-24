variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "ecs-bluegreen"
}

variable "container_name" {
  description = "Container name inside the task definition. buildspec picks the container by this name"
  type        = string
  default     = "web"
}

variable "bootstrap_image" {
  description = "Image the service starts with before the first pipeline run. Public so the service is healthy before ECR has anything"
  type        = string
  default     = "public.ecr.aws/nginx/nginx:alpine"
}

variable "desired_count" {
  description = "Number of tasks. Green side launches the same number during a deployment"
  type        = number
  default     = 2
}

variable "task_cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 512
}

variable "bake_time_in_minutes" {
  description = "How long blue keeps running after production traffic moved to green. Rollback inside this window is instant"
  type        = number
  default     = 3
}

variable "hook_lifecycle_stages" {
  description = "Deployment stages where the validation Lambda runs"
  type        = list(string)
  default     = ["POST_TEST_TRAFFIC_SHIFT"]
}

variable "test_listener_port" {
  description = "ALB port that routes test traffic to green during a deployment"
  type        = number
  default     = 8080
}

variable "codebuild_image" {
  description = "CodeBuild image. Only aws cli and jq are used, so the standard image is enough"
  type        = string
  default     = "aws/codebuild/amazonlinux-aarch64-standard:3.0"
}

variable "codebuild_compute_type" {
  description = "CodeBuild compute type"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "config_object_key" {
  description = "Object key in the config bucket that triggers the config pipeline"
  type        = string
  default     = "config.zip"
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention for every log group in this workspace"
  type        = number
  default     = 7
}
