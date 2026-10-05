variable "aws_region" {
  description = "실습 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "실습 리소스 이름 접두사"
  type        = string
  default     = "ecs-shared-build"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.project_name))
    error_message = "project_name은 영문 소문자로 시작하는 3~20자여야 합니다."
  }
}

variable "allowed_cidr" {
  description = "8080 접속을 허용할 IPv4 CIDR (예: 사용자 공인 IP/32)"
  type        = string

  validation {
    condition     = can(cidrnetmask(var.allowed_cidr)) && var.allowed_cidr != "0.0.0.0/0"
    error_message = "전체 인터넷을 제외한 유효한 IPv4 CIDR을 지정하세요."
  }
}

variable "vpc_cidr" {
  description = "실습 VPC CIDR"
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "public subnet CIDR"
  type        = list(string)
  default     = ["10.42.1.0/24", "10.42.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) > 0 && length(var.public_subnet_cidrs) <= 2
    error_message = "public subnet은 1~2개를 지정하세요."
  }
}

variable "existing_connection_arn" {
  description = "기존 AVAILABLE GitHub connection ARN. null이면 실습용 연결 생성"
  type        = string
  default     = null

  validation {
    condition     = var.existing_connection_arn == null ? true : can(regex("^arn:aws:(codeconnections|codestar-connections):[^:]+:[0-9]{12}:connection/.+$", var.existing_connection_arn))
    error_message = "CodeConnections 또는 기존 CodeStar Connections ARN을 지정하세요."
  }
}

variable "log_retention_days" {
  description = "ECS와 CodeBuild 로그 보관일"
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365], var.log_retention_days)
    error_message = "CloudWatch Logs가 지원하는 보관일을 지정하세요."
  }
}

variable "artifact_expiration_days" {
  description = "현재 실행 아티팩트 만료일"
  type        = number
  default     = 30

  validation {
    condition     = var.artifact_expiration_days > 0 && floor(var.artifact_expiration_days) == var.artifact_expiration_days
    error_message = "아티팩트 만료일은 양의 정수여야 합니다."
  }
}

variable "artifact_noncurrent_expiration_days" {
  description = "비현재 버전 만료일"
  type        = number
  default     = 7

  validation {
    condition     = var.artifact_noncurrent_expiration_days > 0 && floor(var.artifact_noncurrent_expiration_days) == var.artifact_noncurrent_expiration_days
    error_message = "비현재 버전 만료일은 양의 정수여야 합니다."
  }
}

variable "multipart_abort_days" {
  description = "미완료 multipart upload 정리일"
  type        = number
  default     = 7

  validation {
    condition     = var.multipart_abort_days > 0 && floor(var.multipart_abort_days) == var.multipart_abort_days
    error_message = "multipart 정리일은 양의 정수여야 합니다."
  }
}
