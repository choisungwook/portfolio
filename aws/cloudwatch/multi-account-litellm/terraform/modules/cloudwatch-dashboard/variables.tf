variable "dashboard_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "cross_account" {
  description = "true면 모니터링 계정에서 source 계정 데이터를 accountId와 로그 그룹 ARN으로 가리킨다"
  type        = bool
}

variable "accounts" {
  description = "대시보드에 올릴 계정. 계정 하나면 방안 1, 둘 이상이면 방안 2"
  type = list(object({
    name                    = string
    account_id              = string
    cluster_name            = string
    service_name            = string
    alb_arn_suffix          = string
    target_group_arn_suffix = string
    log_group_name          = string
    log_group_arn           = string
  }))
}
