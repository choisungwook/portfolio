locals {
  my_cidr = "${chomp(data.http.my_ip.response_body)}/32"

  account_ids = {
    monitoring = data.aws_caller_identity.monitoring.account_id
    dev        = data.aws_caller_identity.dev.account_id
    prod       = data.aws_caller_identity.prod.account_id
  }

  litellm_master_key = "sk-${random_password.litellm_master_key.result}"
  # 로컬 lab과 같은 config를 쓰되, ALB가 외부에 열려 있으니 /metrics에는 인증을 건다.
  litellm_config = replace(
    file("${path.module}/../local/litellm/config.yaml"),
    "require_auth_for_metrics_endpoint: false",
    "require_auth_for_metrics_endpoint: true",
  )
  loadgen_script = file("${path.module}/../local/loadgen/loadgen.py")

  # 방안 4에서 수집기가 assume하는 모니터링 계정 role. 이름을 미리 정해 두어 계정 간 순환 참조를 피한다.
  amp_writer_role_name = "${var.project_name}-amp-writer"
  amp_writer_role_arn  = "arn:aws:iam::${local.account_ids.monitoring}:role/${local.amp_writer_role_name}"

  remote_write_amp = var.enable_amp ? {
    endpoint = "${aws_prometheus_workspace.litellm[0].prometheus_endpoint}api/v1/remote_write"
    role_arn = local.amp_writer_role_arn
  } : null
}
