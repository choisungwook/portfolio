variable "aws_region" {
  description = "리소스를 만들 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름 접두사와 태그에 쓰는 프로젝트 이름"
  type        = string
  default     = "litellm-airgap"
}

variable "vpc_cidr" {
  description = "폐쇄망 VPC의 CIDR"
  type        = string
  default     = "10.20.0.0/16"
}

variable "azs" {
  description = "private subnet을 배치할 가용 영역"
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "private_subnet_cidrs" {
  description = "private subnet CIDR 목록. azs와 개수가 같아야 한다"
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "arch" {
  description = "EC2 아키텍처. arm64 또는 x86_64"
  type        = string
  default     = "arm64"
}

variable "instance_type" {
  description = "EC2 인스턴스 타입"
  type        = string
  default     = "t4g.medium"
}

variable "ebs_size" {
  description = "루트 EBS 크기(GB)"
  type        = number
  default     = 30
}
