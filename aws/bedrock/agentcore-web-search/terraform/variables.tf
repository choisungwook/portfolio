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

variable "log_retention_days" {
  description = "Gateway 애플리케이션 로그 보존 기간"
  type        = number
  default     = 7

  validation {
    condition = contains(
      [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653],
      var.log_retention_days
    )
    error_message = "CloudWatch Logs가 지원하는 보존 일수를 입력한다."
  }
}
