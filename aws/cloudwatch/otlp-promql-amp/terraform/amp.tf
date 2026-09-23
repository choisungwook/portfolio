# AMP는 저장소만 제공한다. metric은 로컬 수집기가 remote write로 넣는다.
resource "aws_prometheus_workspace" "this" {
  alias = var.project_name
}

resource "aws_prometheus_workspace_configuration" "this" {
  workspace_id             = aws_prometheus_workspace.this.id
  retention_period_in_days = var.amp_retention_days
}
