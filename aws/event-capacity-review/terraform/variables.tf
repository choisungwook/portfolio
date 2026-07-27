variable "aws_region" {
  description = "AWS region for the lab"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource names and tags"
  type        = string
  default     = "event-capacity-lab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.project_name))
    error_message = "project_name must be 3-32 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the ASG launch template"
  type        = string
  default     = "t4g.small"
}

variable "arch" {
  description = "AMI architecture, matched to the instance type"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "arch must be arm64 or x86_64."
  }
}

variable "ebs_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 30
}

variable "asg_min_size" {
  description = "ASG minimum capacity"
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "ASG maximum capacity"
  type        = number
  default     = 4
}

variable "asg_desired_capacity" {
  description = "ASG desired capacity at apply time"
  type        = number
  default     = 1
}

variable "warm_pool_min_size" {
  description = "Number of pre-initialized stopped instances kept in the warm pool"
  type        = number
  default     = 2
}

variable "cpu_target_value" {
  description = "Average CPU percent the target tracking policy keeps"
  type        = number
  default     = 50
}

variable "event_scale_out_at" {
  description = "UTC time (yyyy-mm-ddThh:mm:ssZ) to raise capacity before the event. null disables the schedule"
  type        = string
  default     = null
}

variable "event_scale_in_at" {
  description = "UTC time (yyyy-mm-ddThh:mm:ssZ) to restore capacity after the event. null disables the schedule"
  type        = string
  default     = null
}

variable "event_min_size" {
  description = "ASG minimum capacity during the event window"
  type        = number
  default     = 3
}
