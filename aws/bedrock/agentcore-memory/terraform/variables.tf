variable "aws_region" {
  description = "AgentCore Memory를 만들 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "default_tags의 Project 값"
  type        = string
  default     = "agentcore-memory-handson"
}

variable "event_expiry_days" {
  description = "단기 메모리(event) 보존 일수. 허용 범위 7~365이며 실습은 최솟값을 쓴다"
  type        = number
  default     = 7
}
