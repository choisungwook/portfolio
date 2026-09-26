variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "selinux-handson"
}

variable "arch" {
  description = "arm64 | x86_64. arm64로 바꾸면 instance_type도 t4g.medium으로 바꾼다"
  type        = string
  default     = "x86_64"
}

variable "instance_type" {
  description = "EC2 인스턴스 타입"
  type        = string
  default     = "t3.medium"
}

variable "root_volume_size" {
  description = "루트 볼륨 크기 GiB"
  type        = number
  default     = 30
}
