locals {
  namespace    = "${var.name}.internal"
  vm_dns       = "victoriametrics.${local.namespace}"
  grafana_path = "/tmp/grafana"

  grafana_datasources = yamlencode({
    apiVersion = 1
    datasources = [
      {
        name      = "metrics"
        type      = "prometheus"
        uid       = "metrics"
        access    = "proxy"
        url       = "http://${local.vm_dns}:8428"
        isDefault = true
      },
      {
        # task role로 인증한다. OAM monitoring 계정이면 source 계정의 metric과 로그도 함께 조회된다.
        name     = "cloudwatch"
        type     = "cloudwatch"
        uid      = "cloudwatch"
        access   = "proxy"
        jsonData = { authType = "default", defaultRegion = var.aws_region }
      },
    ]
  })

  grafana_dashboard_provider = yamlencode({
    apiVersion = 1
    providers = [{
      name    = "litellm"
      type    = "file"
      folder  = "LiteLLM"
      options = { path = "${local.grafana_path}/dashboards" }
    }]
  })

  # Grafana 이미지에 설정 파일을 굽지 않는다. 환경 변수로 넘긴 내용을 기동 직전에 파일로 쓴다.
  grafana_bootstrap = join(" && ", concat(
    [
      "mkdir -p ${local.grafana_path}/provisioning/datasources ${local.grafana_path}/provisioning/dashboards ${local.grafana_path}/dashboards",
      "printf '%s' \"$DATASOURCES\" > ${local.grafana_path}/provisioning/datasources/datasources.yml",
      "printf '%s' \"$DASHBOARD_PROVIDER\" > ${local.grafana_path}/provisioning/dashboards/provider.yml",
    ],
    [for file_name, _ in var.dashboards : "printf '%s' \"$DASHBOARD_${upper(replace(file_name, "-", "_"))}\" > ${local.grafana_path}/dashboards/${file_name}.json"],
    ["exec /run.sh"],
  ))

  dashboard_env = [for file_name, body in var.dashboards : {
    name  = "DASHBOARD_${upper(replace(file_name, "-", "_"))}"
    value = body
  }]
}
