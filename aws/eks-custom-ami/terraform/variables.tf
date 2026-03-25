variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "eks-custom-ami"
}

variable "assume_role_arn" {
  description = "IAM Role ARN for EKS deployment"
  type        = string
}

variable "custom_ami_id" {
  description = "Packer로 빌드한 커스텀 EKS AMI ID"
  type        = string
}

######################################################################
# EKS
######################################################################

variable "eks_cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "eks_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.35"
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
  default     = true
}

######################################################################
# EKS auto mode
######################################################################

variable "auto_mode_enabled" {
  description = "Enable EKS Auto Mode"
  type        = bool
  default     = false
}

variable "cluster_compute_config" {
  description = "Configuration block for the cluster compute configuration"
  type        = any
  default     = {}
}
