locals {
  ecs_grafana = var.grafana == "ecs"
  amg         = var.grafana == "amg"

  namespace       = "${var.project_name}.internal"
  app_dns_name    = "app.${local.namespace}"
  collector_image = "otel/opentelemetry-collector-contrib:0.161.0"
  app_image       = "python:3.13-slim"
  grafana_image   = "grafana/grafana:13.2.2"
}
