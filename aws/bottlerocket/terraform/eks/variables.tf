variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "bottlerocket"
}

variable "eks_cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "bottlerocket-1-36"
}

variable "eks_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.36"
}

variable "instance_type" {
  description = "노드 인스턴스 타입. x86으로 바꾸면 ami_type도 BOTTLEROCKET_x86_64로 바꾼다"
  type        = string
  default     = "t4g.medium"
}

variable "ami_type" {
  description = "관리형 노드그룹 ami_type"
  type        = string
  default     = "BOTTLEROCKET_ARM_64"
}

variable "admin_ssh_public_key" {
  description = "비워 두면 admin container를 끈 채로 둔다. 공개키를 넣으면 admin container를 켜고 SSH 키를 등록한다"
  type        = string
  default     = ""
}

