variable "aws_region" {
  description = "AWS region. EC2의 Nitro Sandboxes는 모든 상용 리전에서 쓸 수 있다"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "nitro-sandboxes-ec2"
}

variable "instance_type" {
  description = "부모 인스턴스 타입. t4g, flex, m7g.medium은 Nitro Sandboxes를 지원하지 않는다. m7g.large는 Graviton이라 vCPU 하나가 물리 코어 하나다"
  type        = string
  default     = "m7g.large"
}

variable "ssh_public_key_path" {
  description = "EC2 key pair로 등록할 로컬 공개키 경로"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}
