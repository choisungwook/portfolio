variable "name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_cidr" {
  description = "Grafana ALB에 접근할 수 있는 CIDR"
  type        = string
}

variable "source_account_ids" {
  description = "PrivateLink endpoint를 만들 수 있는 계정"
  type        = list(string)
}

variable "cpu_architecture" {
  type = string
}

variable "victoriametrics_image" {
  type = string
}

variable "grafana_image" {
  type = string
}

variable "retention_days" {
  type = number
}

variable "grafana_admin_password" {
  type      = string
  sensitive = true
}

variable "dashboards" {
  description = "Grafana에 프로비저닝할 대시보드. 파일 이름 => JSON 문자열"
  type        = map(string)
}

variable "amp_query" {
  description = "방안 B. Grafana task role에 AMP 조회 권한을 줄지와 대상 workspace. ARN은 apply 뒤에 정해져 켜고 끄는 값을 따로 받는다"
  type = object({
    enabled       = bool
    workspace_arn = string
  })
  default = { enabled = false, workspace_arn = null }
}
