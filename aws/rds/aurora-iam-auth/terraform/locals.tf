locals {
  my_cidr       = "${chomp(data.http.my_ip.response_body)}/32"
  allowed_cidrs = length(var.allowed_cidrs) > 0 ? var.allowed_cidrs : [local.my_cidr]

  ssm_prefix = "/${var.project_name}"
  # IAM 인증 전용 DB 사용자. rds-db:connect 리소스 ARN과 CREATE USER 이름이 같아야 한다.
  iam_db_user      = "app_iam"
  password_db_user = "app_pw"
}
