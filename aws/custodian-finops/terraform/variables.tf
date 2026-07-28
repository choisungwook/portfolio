variable "aws_region" {
  description = "Region the lab runs in."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name prefix and Project tag for every resource."
  type        = string
  default     = "custodian-finops"
}

variable "arch" {
  description = "CPU architecture of the EC2 AMI."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "arch must be arm64 or x86_64."
  }
}

variable "instance_type" {
  description = "EC2 instance type. Must match var.arch."
  type        = string
  default     = "t4g.small"
}

variable "ebs_size" {
  description = "Root volume size in GB."
  type        = number
  default     = 30
}

variable "orphan_volume_size" {
  description = "Size of the deliberately detached volume the orphan policy finds."
  type        = number
  default     = 10
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB."
  type        = number
  default     = 20
}

variable "create_rds" {
  description = "RDS is the expensive half of the lab. Set false to run the EC2 and EBS policies only."
  type        = bool
  default     = true
}
