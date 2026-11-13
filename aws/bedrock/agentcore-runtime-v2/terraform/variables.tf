variable "aws_region" {
  description = "실습 리전. Runtime V2가 신규 runtime 기본값인 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름과 태그에 쓰는 프로젝트 이름"
  type        = string
  default     = "agentcore-runtime-v2"
}

variable "image_tag" {
  description = "agent 컨테이너 이미지 tag. 바꾸면 runtime 새 버전이 생긴다"
  type        = string
  default     = "v1"
}

variable "init_seconds" {
  description = "agent가 포트를 열기 전 무거운 초기화를 흉내 내는 대기 시간(초)"
  type        = number
  default     = 20
}

variable "init_memory_mb" {
  description = "초기화 때 적재하는 메모리(MB). 모델 가중치를 흉내 낸다. 시나리오 4에서 바꿔 runtime 새 버전을 만든다"
  type        = number
  default     = 512
}
