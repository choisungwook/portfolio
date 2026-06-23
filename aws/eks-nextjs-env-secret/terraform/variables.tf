variable "aws_region" {
  description = "AWS region for the hands-on resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for tags and resource names."
  type        = string
  default     = "eks-nextjs-env-secret"
}

variable "demo_secret_value" {
  description = "Demo Secret value stored in AWS Secrets Manager. Do not put a real password here."
  type        = string
  sensitive   = true
}

variable "eks_oidc_provider_arn" {
  description = "EKS cluster OIDC provider ARN used by the External Secrets controller service account."
  type        = string
}

variable "eks_oidc_provider_url_without_https" {
  description = "EKS OIDC issuer URL without https://. Example: oidc.eks.ap-northeast-2.amazonaws.com/id/EXAMPLE"
  type        = string
}

variable "external_secrets_namespace" {
  description = "Namespace where External Secrets Operator runs."
  type        = string
  default     = "external-secrets"
}

variable "external_secrets_service_account_name" {
  description = "ServiceAccount name used by External Secrets Operator."
  type        = string
  default     = "external-secrets"
}
