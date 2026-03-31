variable "aws_region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "프로젝트 이름"
  type        = string
  default     = "sns-example"
}

variable "email_address" {
  description = "SNS 구독에 사용할 이메일 주소"
  type        = string
}
