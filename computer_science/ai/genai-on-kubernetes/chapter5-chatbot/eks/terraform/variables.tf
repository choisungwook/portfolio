variable "project_name" {
  description = "Name used for AWS resource tags and resource names."
  type        = string
  default     = "genai-ch5-eks"
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
  default     = "genai-ch5-eks"
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

variable "gpu_node_instance_types" {
  description = "GPU managed node group instance types."
  type        = list(string)
  default     = ["g6.xlarge"]
}

variable "cpu_node_disk_size" {
  description = "CPU managed node group root volume size in GiB."
  type        = number
  default     = 30
}

variable "gpu_node_disk_size" {
  description = "GPU managed node group root volume size in GiB."
  type        = number
  default     = 200
}

variable "s3files_prefix" {
  description = "S3 prefix exposed through the S3 Files file system. Must end with slash."
  type        = string
  default     = "chapter5/"

  validation {
    condition     = can(regex("^(.*/)$", var.s3files_prefix))
    error_message = "s3files_prefix must end with '/'."
  }
}

variable "s3files_access_point_uid" {
  description = "POSIX UID enforced by the S3 Files access points."
  type        = number
  default     = 1000
}

variable "s3files_access_point_gid" {
  description = "POSIX GID enforced by the S3 Files access points."
  type        = number
  default     = 1000
}

variable "s3files_model_assets_path" {
  description = "S3 Files root directory path for writable model assets. Use a path that does not already exist so creation permissions are applied."
  type        = string
  default     = "/model-assets-writable"

  validation {
    condition     = can(regex("^/[^/].*", var.s3files_model_assets_path))
    error_message = "s3files_model_assets_path must be an absolute path other than '/'."
  }
}

variable "s3files_model_assets_permissions" {
  description = "POSIX permissions for the writable model assets access point root directory."
  type        = string
  default     = "775"

  validation {
    condition     = can(regex("^[0-7]{3,4}$", var.s3files_model_assets_permissions))
    error_message = "s3files_model_assets_permissions must be an octal mode string such as 775."
  }
}

variable "force_destroy_artifact_bucket" {
  description = "Allow Terraform destroy to delete the S3 artifact bucket even when it contains objects."
  type        = bool
  default     = false
}
