variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "bottlerocket-ec2"
}

variable "bottlerocket_variant" {
  description = "Bottlerocket 변형. EKS 노드와 같은 aws-k8s 변형을 쓴다"
  type        = string
  default     = "aws-k8s-1.36"
}

variable "bottlerocket_version" {
  description = "latest 또는 1.64.0 같은 버전. A/B 업데이트를 보려면 latest보다 낮은 버전으로 부팅한다"
  type        = string
  default     = "latest"
}

variable "arch" {
  description = "arm64 | x86_64. x86_64로 바꾸면 instance_type도 t3.medium으로 바꾼다"
  type        = string
  default     = "arm64"
}

variable "instance_type" {
  description = "EC2 인스턴스 타입"
  type        = string
  default     = "t4g.medium"
}

variable "data_volume_size" {
  description = "데이터 볼륨(/dev/xvdb) 크기 GiB. 컨테이너 이미지와 로그가 여기에 쌓인다"
  type        = number
  default     = 20
}

variable "admin_ssh_public_key" {
  description = "비워 두면 admin container를 끈 채로 둔다. 공개키를 넣으면 admin container를 켜고 SSH 키를 등록한다"
  type        = string
  default     = ""
}
