# Grafana는 자기 task role로 두 저장소를 조회한다. 쓰기 권한은 없다.
resource "aws_iam_role" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  name               = "${var.project_name}-grafana"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "grafana" {
  statement {
    sid = "AmpQuery"
    actions = [
      "aps:QueryMetrics",
      "aps:GetLabels",
      "aps:GetSeries",
      "aps:GetMetricMetadata",
    ]
    resources = [aws_prometheus_workspace.this.arn]
  }

  # CloudWatch PromQL API는 기존 metric 조회 권한을 쓴다.
  statement {
    sid       = "CloudWatchPromQL"
    actions   = ["cloudwatch:GetMetricData", "cloudwatch:ListMetrics"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  name   = "query-metrics"
  role   = aws_iam_role.grafana[0].id
  policy = data.aws_iam_policy_document.grafana.json
}

resource "aws_ecs_task_definition" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  family                   = "${var.project_name}-grafana"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.grafana[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "grafana"
    image     = local.grafana_image
    essential = true
    # 설정 파일을 환경 변수로 받아 provisioning 경로에 쓴 뒤 Grafana를 띄운다.
    entryPoint = ["sh", "-c"]
    command = [join(" && ", [
      "mkdir -p /tmp/grafana/datasources /tmp/grafana/dashboards /tmp/grafana/plugins /tmp/grafana/alerting",
      "printf '%s' \"$DATASOURCES_YAML\" > /tmp/grafana/datasources/datasources.yaml",
      "printf '%s' \"$DASHBOARDS_YAML\" > /tmp/grafana/dashboards/provider.yaml",
      "printf '%s' \"$DASHBOARD_JSON\" > /tmp/grafana/dashboards/compare.json",
      "exec /run.sh",
    ])]
    portMappings = [{ containerPort = 3000 }]

    environment = [
      { name = "GF_PATHS_PROVISIONING", value = "/tmp/grafana" },
      { name = "GF_PLUGINS_PREINSTALL_SYNC", value = "grafana-amazonprometheus-datasource" },
      # 로그인 없이 Viewer로 연다. ALB가 실습자 IP만 받는다.
      { name = "GF_AUTH_ANONYMOUS_ENABLED", value = "true" },
      { name = "GF_AUTH_ANONYMOUS_ORG_ROLE", value = "Viewer" },
      { name = "GF_AUTH_DISABLE_LOGIN_FORM", value = "true" },
      { name = "GF_AUTH_BASIC_ENABLED", value = "false" },
      { name = "GF_USERS_VIEWERS_CAN_EDIT", value = "true" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "AMP_QUERY_URL", value = aws_prometheus_workspace.this.prometheus_endpoint },
      { name = "DATASOURCES_YAML", value = file("${path.module}/../grafana/datasources.yaml") },
      { name = "DASHBOARDS_YAML", value = file("${path.module}/../grafana/dashboards.yaml") },
      { name = "DASHBOARD_JSON", value = file("${path.module}/../grafana/compare.json") },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "grafana"
      }
    }
  }])
}

resource "aws_ecs_service" "grafana" {
  count = local.ecs_grafana ? 1 : 0

  name            = "grafana"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.grafana[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.grafana[0].id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.grafana[0].arn
    container_name   = "grafana"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.grafana]
}
