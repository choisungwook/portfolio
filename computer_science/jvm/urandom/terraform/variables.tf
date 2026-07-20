variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름과 태그에 쓰는 프로젝트 이름"
  type        = string
  default     = "jvm-urandom"
}

variable "instance_type" {
  description = "EC2 인스턴스 타입 (Graviton)"
  type        = string
  default     = "t4g.small"
}

variable "arch" {
  description = "AMI 아키텍처 (arm64 | x86_64)"
  type        = string
  default     = "arm64"
}

variable "ebs_size" {
  description = "루트 EBS 크기(GB)"
  type        = number
  default     = 30
}
