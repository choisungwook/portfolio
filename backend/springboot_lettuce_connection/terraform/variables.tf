variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
}

variable "eks_cluster_name" {
  type = string
}

variable "eks_version" {
  description = "EKS Version"
  type        = string
}

variable "oidc_provider_enabled" {
  description = "OIDC Provider Enabled"
  type        = bool
  default     = true
}

variable "endpoint_private_access" {
  description = "Endpoint Private Access"
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Endpoint Public Access"
  type        = bool
}

variable "managed_node_groups" {
  type = map(object({
    node_group_name = string
    instance_types  = list(string)
    capacity_type   = string
    release_version = string
    disk_size       = number
    desired_size    = number
    max_size        = number
    min_size        = number
  }))
}

variable "assume_role_arn" {
  description = "EKS를 생성할 IAM role" # export AWS_PROFILE={profile_name}
  type        = string
}

variable "enable_amp" {
  type    = bool
  default = false
}
