variable "aws_region" {
  description = "실습 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름 접두사와 Project 태그"
  type        = string
  default     = "aurora-iam-lab"
}

variable "allowed_cidrs" {
  description = "EC2와 Aurora에 접근할 CIDR 목록. 비워 두면 apply하는 PC의 공인 IP(/32)를 자동으로 조회해 쓴다."
  type        = list(string)
  default     = []
}

variable "iam_auth_enabled" {
  description = "Aurora 클러스터의 IAM DB 인증과 EC2 role의 rds-db:connect 권한을 켠다. 마이그레이션 시나리오에서 true로 바꾼다."
  type        = bool
  default     = false
}

variable "app_port" {
  description = "EC2 애플리케이션 HTTP 포트"
  type        = number
  default     = 8080
}

variable "probe_interval_seconds" {
  description = "Lambda prober가 API를 호출하는 간격(초). 0.5~1을 권장한다."
  type        = number
  default     = 1
}

variable "db_name" {
  description = "애플리케이션 데이터베이스 이름"
  type        = string
  default     = "labdb"
}

variable "instance_type" {
  description = "EC2 앱 인스턴스 타입"
  type        = string
  default     = "t4g.small"
}

variable "aurora_min_acu" {
  description = "Aurora Serverless v2 최소 ACU"
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "Aurora Serverless v2 최대 ACU"
  type        = number
  default     = 2
}
