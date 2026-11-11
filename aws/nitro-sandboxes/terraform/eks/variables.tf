variable "aws_region" {
  description = "AWS region. EKS의 isolated/confidential pod는 US 상용 리전에서만 제공된다"
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "nitro-sandboxes-eks"
}

variable "eks_cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "nitro-sandbox"
}

variable "eks_version" {
  description = "Nitro Sandbox runtime class는 Kubernetes 1.36 이상에서만 동작한다"
  type        = string
  default     = "1.37"
}
