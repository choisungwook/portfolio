output "amp_query_url" {
  description = "AMP PromQL 조회 주소. awscurl --service aps로 서명한다"
  value       = aws_prometheus_workspace.this.prometheus_endpoint
}

output "cloudwatch_promql_url" {
  description = "CloudWatch PromQL 조회 주소. awscurl --service monitoring으로 서명한다"
  value       = "https://monitoring.${var.aws_region}.amazonaws.com"
}

output "aws_region" {
  description = "실습 리전"
  value       = var.aws_region
}

output "grafana_url" {
  description = "ECS Grafana. 실습자 IP에서만 열린다"
  value       = local.ecs_grafana ? "http://${aws_lb.grafana[0].dns_name}" : null
}

output "cloudwatch_dashboard_url" {
  description = "CloudWatch PromQL 대시보드"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${aws_cloudwatch_dashboard.promql.dashboard_name}"
}

output "amg_url" {
  description = "AMG 주소. IAM Identity Center로 로그인한다"
  value       = local.amg ? "https://${aws_grafana_workspace.this[0].endpoint}" : null
}

output "amg_workspace_id" {
  description = "AMG workspace ID"
  value       = local.amg ? aws_grafana_workspace.this[0].id : null
}
