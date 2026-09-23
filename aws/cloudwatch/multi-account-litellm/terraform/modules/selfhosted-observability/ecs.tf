resource "aws_ecs_cluster" "observability" {
  name = var.name
}

# ---------- VictoriaMetrics: 중앙 저장소 ----------
resource "aws_ecs_task_definition" "victoriametrics" {
  family                   = "${var.name}-victoriametrics"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.victoriametrics.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  volume {
    name = "storage"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.observability.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.victoriametrics.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([{
    name      = "victoriametrics"
    image     = var.victoriametrics_image
    essential = true
    command = [
      "-storageDataPath=/storage",
      "-retentionPeriod=${var.retention_days}d",
    ]

    portMappings = [{ containerPort = 8428, protocol = "tcp" }]
    mountPoints  = [{ sourceVolume = "storage", containerPath = "/storage" }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.observability.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "victoriametrics"
      }
    }
  }])
}

# 저장소가 single-node라 task는 1개다. 2개를 띄우면 같은 디렉터리를 동시에 쓴다.
resource "aws_ecs_service" "victoriametrics" {
  name            = "victoriametrics"
  cluster         = aws_ecs_cluster.observability.id
  task_definition = aws_ecs_task_definition.victoriametrics.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.remote_write.arn
    container_name   = "victoriametrics"
    container_port   = 8428
  }

  service_registries {
    registry_arn = aws_service_discovery_service.victoriametrics.arn
  }

  depends_on = [aws_efs_mount_target.observability, aws_lb_listener.remote_write]
}

# ---------- Grafana ----------
resource "aws_ecs_task_definition" "grafana" {
  family                   = "${var.name}-grafana"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.grafana.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  volume {
    name = "grafana"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.observability.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.grafana.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([{
    name      = "grafana"
    image     = var.grafana_image
    essential = true

    entryPoint = ["sh", "-c"]
    command    = [local.grafana_bootstrap]

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    mountPoints  = [{ sourceVolume = "grafana", containerPath = "/var/lib/grafana" }]

    environment = concat([
      { name = "GF_PATHS_PROVISIONING", value = "${local.grafana_path}/provisioning" },
      # 링크만 받은 사람이 로그인 없이 대시보드를 본다. 수정은 admin만 한다.
      { name = "GF_AUTH_ANONYMOUS_ENABLED", value = "true" },
      { name = "GF_AUTH_ANONYMOUS_ORG_ROLE", value = "Viewer" },
      # AMP는 SigV4 서명이 필요해 전용 datasource plugin을 쓴다.
      { name = "GF_PLUGINS_PREINSTALL", value = "grafana-amazonprometheus-datasource" },
      { name = "DATASOURCES", value = local.grafana_datasources },
      { name = "DASHBOARD_PROVIDER", value = local.grafana_dashboard_provider },
    ], local.dashboard_env)

    secrets = [
      { name = "GF_SECURITY_ADMIN_PASSWORD", valueFrom = aws_ssm_parameter.grafana_admin_password.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.observability.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "grafana"
      }
    }
  }])
}

resource "aws_ecs_service" "grafana" {
  name                              = "grafana"
  cluster                           = aws_ecs_cluster.observability.id
  task_definition                   = aws_ecs_task_definition.grafana.arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 120

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.grafana.arn
    container_name   = "grafana"
    container_port   = 3000
  }

  depends_on = [aws_efs_mount_target.observability, aws_lb_listener.grafana]
}
