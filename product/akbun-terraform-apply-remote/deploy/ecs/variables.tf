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

variable "image" {
  description = "Container image (ECR URI with tag). Pushing a new tag and applying is a deployment; ECS rolls tasks with the old task draining gracefully."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener. Created in the console beforehand."
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone id for the webhook domain. Empty string skips record creation."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Webhook domain name (e.g. atr.example.com). Used only when route53_zone_id is set."
  type        = string
  default     = ""
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
  description = "Port the container listens on"
  type        = number
  default     = 4141
}

variable "task_cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory (MiB)"
  type        = number
  default     = 1024
}

variable "task_role_policy_arns" {
  description = "IAM policies attached to the task role, granting the terraform runs inside the container their AWS permissions. Lab default is PowerUserAccess; narrow it in production."
  type        = list(string)
  default     = ["arn:aws:iam::aws:policy/PowerUserAccess"]
}
