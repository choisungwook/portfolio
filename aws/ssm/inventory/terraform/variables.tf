variable "aws_region" {
  description = "실습 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름 접두사와 Project 태그 값"
  type        = string
  default     = "ssm-inventory"
}

variable "instance_type" {
  description = "managed node로 쓸 EC2 인스턴스 타입"
  type        = string
  default     = "t4g.small"
}

variable "arch" {
  description = "AMI 아키텍처 (arm64 | x86_64). instance_type과 맞춰야 한다"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "arch는 arm64 또는 x86_64만 허용한다."
  }
}

variable "root_volume_size" {
  description = "루트 EBS 크기(GB)"
  type        = number
  default     = 30
}

variable "inventory_schedule" {
  description = "기본 inventory 수집 주기. 최소 30분"
  type        = string
  default     = "rate(30 minutes)"
}
