variable "aws_region" {
  description = "AgentCore Web Search가 지원되는 AWS 리전"
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "eu-west-1", "ap-northeast-1"], var.aws_region)
    error_message = "지원 리전은 us-east-1, eu-west-1, ap-northeast-1이다."
  }
}

variable "project_name" {
  description = "리소스 이름과 태그에 사용할 프로젝트 이름"
  type        = string
  default     = "agentcore-web-search-handson"
}

variable "connector_version" {
  description = "고정할 Web Search connector 버전"
  type        = string
  default     = "1.2.0"
}

variable "included_domains" {
  description = "모든 검색에 적용할 도메인 허용 목록"
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.included_domains) <= 100
    error_message = "도메인 허용 목록은 최대 100개다."
  }
}

variable "excluded_domains" {
  description = "모든 검색에 적용할 도메인 차단 목록"
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.excluded_domains) <= 100
    error_message = "도메인 차단 목록은 최대 100개다."
  }
}

variable "log_retention_days" {
  description = "Gateway 애플리케이션 로그 보존 기간"
  type        = number
  default     = 7
}
