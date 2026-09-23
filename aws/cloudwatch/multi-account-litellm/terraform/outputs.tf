output "litellm_endpoints" {
  description = "LiteLLM ALB 주소. 실습자 IP에서만 열린다"
  value = {
    dev  = "http://${module.litellm_dev.alb_dns_name}"
    prod = "http://${module.litellm_prod.alb_dns_name}"
  }
}

output "litellm_master_key" {
  value     = local.litellm_master_key
  sensitive = true
}

output "cloudwatch_dashboards" {
  value = {
    dev     = module.dashboard_dev.dashboard_name
    prod    = module.dashboard_prod.dashboard_name
    central = var.enable_oam ? module.dashboard_central[0].dashboard_name : null
  }
}

output "selfhosted_grafana_url" {
  value = var.enable_selfhosted ? module.selfhosted[0].grafana_url : null
}

output "selfhosted_grafana_admin_password" {
  value     = var.enable_selfhosted ? random_password.grafana_admin[0].result : null
  sensitive = true
}

output "amp_workspace_id" {
  value = var.enable_amp ? aws_prometheus_workspace.litellm[0].id : null
}

output "amp_query_endpoint" {
  value = var.enable_amp ? aws_prometheus_workspace.litellm[0].prometheus_endpoint : null
}

output "amg_url" {
  value = var.enable_amg ? "https://${aws_grafana_workspace.litellm[0].endpoint}" : null
}

output "grafana_logs_dashboard" {
  description = "AMG에 가져올 로그 대시보드 JSON. 방안 3은 자동으로 프로비저닝된다"
  value       = local.logs_dashboard
}
