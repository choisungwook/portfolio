# CloudWatch 콘솔 대시보드. chart 위젯에 PromQL을 넣는다. Grafana 없이 CloudWatch만으로 보는 방법이다.
locals {
  promql_widgets = [
    { title = "model별 요청 수/초", view = "line", query = "sum by (model) (rate(demo_requests_total[5m]))" },
    { title = "replica별 요청 수/초", view = "line", query = "sum by (\"@resource.service.instance.id\") (rate(demo_requests_total[5m]))" },
    { title = "model별 p95 응답 시간(초)", view = "line", query = "histogram_quantile(0.95, sum by (model) (rate(demo_request_duration_seconds[5m])))" },
    { title = "실패율", view = "number", query = "sum(rate(demo_requests_total{status=\"500\"}[5m])) / sum(rate(demo_requests_total[5m]))" },
  ]
}

resource "aws_cloudwatch_dashboard" "promql" {
  dashboard_name = "${var.project_name}-promql"
  dashboard_body = jsonencode({
    start = "-PT1H"
    widgets = [for i, w in local.promql_widgets : {
      type   = "chart"
      x      = (i % 2) * 12
      y      = floor(i / 2) * 6
      width  = 12
      height = 6
      properties = {
        title  = w.title
        view   = w.view
        region = var.aws_region
        data = {
          queries = [{
            id       = "q1"
            type     = "cloudwatch-metrics"
            language = "PromQL"
            query    = w.query
          }]
        }
      }
    }]
  })
}
