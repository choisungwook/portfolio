variable "aws_region" {
  description = "실습 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름과 태그에 붙는 이름"
  type        = string
  default     = "otlp-promql-amp"
}

variable "amp_retention_days" {
  description = "AMP 보관 기간(일). 기본값 150일을 실습 규모에 맞춰 줄인다"
  type        = number
  default     = 30
}

variable "app_replicas" {
  description = "demo app task 수. replica마다 series가 따로 쌓이는지 본다"
  type        = number
  default     = 2
}

variable "grafana" {
  description = "조회 화면. ecs: ECS에 Grafana를 직접 띄운다, amg: Amazon Managed Grafana, none: CloudWatch 대시보드만"
  type        = string
  default     = "ecs"

  validation {
    condition     = contains(["ecs", "amg", "none"], var.grafana)
    error_message = "grafana는 ecs, amg, none 중 하나여야 한다."
  }
}

variable "amg_admin_user_ids" {
  description = "AMG Admin으로 배정할 IAM Identity Center 사용자 ID 목록"
  type        = list(string)
  default     = []
}
