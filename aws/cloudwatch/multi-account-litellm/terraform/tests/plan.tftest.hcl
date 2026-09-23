# AWS 자격 증명 없이 plan을 끝까지 돌려 본다. 방안 조합마다 표현식과 조건부 리소스가 맞게 풀리는지 확인한다.
mock_provider "aws" {
  alias = "monitoring"

  # mock이 만드는 임의 문자열은 JSON이 아니라 IAM 리소스 검증을 통과하지 못한다.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  override_data {
    target = data.aws_caller_identity.monitoring
    values = { account_id = "111111111111" }
  }

  override_data {
    target = data.aws_vpc.monitoring
    values = { cidr_block = "172.31.0.0/16" }
  }
}

mock_provider "aws" {
  alias = "dev"

  # mock이 만드는 임의 문자열은 JSON이 아니라 IAM 리소스 검증을 통과하지 못한다.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  override_data {
    target = data.aws_caller_identity.dev
    values = { account_id = "222222222222" }
  }
}

mock_provider "aws" {
  alias = "prod"

  # mock이 만드는 임의 문자열은 JSON이 아니라 IAM 리소스 검증을 통과하지 못한다.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  override_data {
    target = data.aws_caller_identity.prod
    values = { account_id = "333333333333" }
  }
}

mock_provider "http" {
  override_data {
    target = data.http.my_ip
    values = { response_body = "203.0.113.10" }
  }
}

mock_provider "random" {}

variables {
  monitoring_profile = "lab-monitoring"
  dev_profile        = "lab-dev"
  prod_profile       = "lab-prod"
}

run "option1_only" {
  command = plan

  assert {
    condition     = length(aws_oam_sink.monitoring) == 0 && length(module.selfhosted) == 0 && length(aws_prometheus_workspace.litellm) == 0
    error_message = "기본값에서는 방안 1만 만들어야 한다"
  }

  assert {
    condition     = local.my_cidr == "203.0.113.10/32"
    error_message = "ALB는 실습자 IP만 열어야 한다"
  }

  assert {
    condition     = strcontains(local.litellm_config, "require_auth_for_metrics_endpoint: true")
    error_message = "AWS에서는 /metrics에 인증을 걸어야 한다"
  }
}

run "all_options" {
  command = plan

  variables {
    enable_oam        = true
    enable_selfhosted = true
    enable_amp        = true
    enable_amg        = true
  }

  assert {
    condition     = length(aws_oam_link.dev) == 1 && length(aws_oam_link.prod) == 1
    error_message = "방안 2는 dev·prod 모두 link를 걸어야 한다"
  }

  assert {
    condition     = local.remote_write_amp.role_arn == "arn:aws:iam::111111111111:role/litellm-mon-amp-writer"
    error_message = "수집기는 모니터링 계정 role을 assume해야 한다"
  }

  assert {
    condition     = keys(local.grafana_dashboards) == ["litellm-cost", "litellm-logs", "litellm-overview"]
    error_message = "Grafana에 올릴 대시보드는 metric 2개와 로그 1개다"
  }
}
