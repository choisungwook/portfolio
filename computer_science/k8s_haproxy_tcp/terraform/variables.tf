variable "project_name" {
  description = "Name used for AWS resource tags and resource names."
  type        = string
  default     = "k8s-haproxy-tcp"
}

variable "aws_region" {
  description = "AWS Region for the EKS hands-on."
  type        = string
  default     = "ap-northeast-2"
}

variable "assume_role_arn" {
  description = "Optional IAM role ARN for Terraform AWS provider AssumeRole."
  type        = string
  default     = null
}

variable "eks_cluster_name" {
  description = "EKS cluster name."
  type        = string
  default     = "k8s-haproxy-tcp"
}

variable "eks_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.35"
}

variable "endpoint_private_access" {
  description = "Enable private API endpoint access."
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Enable public API endpoint access."
  type        = bool
  default     = true
}

variable "eks_admin_principal_arns" {
  description = "IAM principal ARNs to grant EKS cluster-admin access entries."
  type        = list(string)
  default     = []
}

variable "grant_current_caller_admin" {
  description = "Grant EKS cluster-admin access to the current Terraform caller."
  type        = bool
  default     = true
}

variable "cpu_node_instance_types" {
  description = "CPU managed node group instance types."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "cpu_node_disk_size" {
  description = "CPU managed node group root volume size in GiB."
  type        = number
  default     = 30
}
